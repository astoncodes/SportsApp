-- Only a proximity-checked RPC can create new feed posts. Device coordinates
-- are checked transiently, never saved alongside public posts.
alter table public.session_posts add column location_verified_at timestamptz;
revoke insert on public.session_posts from authenticated;

create function public.check_session_photo_location(
  p_session_id uuid, p_lat double precision, p_lon double precision,
  p_accuracy double precision, p_observed_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare v_location extensions.geography;
begin
  if auth.uid() is null or not public.can_post_to_session(p_session_id) then
    raise exception 'Join an active session before sharing a photo.';
  end if;
  if p_lat is null or not (p_lat between -90 and 90)
    or p_lon is null or not (p_lon between -180 and 180)
    or p_accuracy is null or not (p_accuracy between 0 and 100) then
    raise exception 'Location is not accurate enough. Enable precise location and try again.';
  end if;
  if p_observed_at is null or p_observed_at < now() - interval '2 minutes'
    or p_observed_at > now() + interval '30 seconds' then
    raise exception 'Your location reading expired. Check your location again.';
  end if;
  select coalesce(v.location,
    extensions.st_setsrid(extensions.st_makepoint(s.longitude, s.latitude), 4326)::extensions.geography)
    into v_location from public.run_sessions s
    left join public.venues v on v.id = s.venue_id where s.id = p_session_id;
  if v_location is null then
    raise exception 'This session needs a meeting location before photos can be shared.';
  end if;
  if not extensions.st_dwithin(v_location,
    extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography, 500) then
    raise exception 'You need to be within 500 metres of the session location to share a photo.';
  end if;
end;
$$;

create function public.create_session_photo_post(
  p_session_id uuid, p_caption text, p_lat double precision, p_lon double precision,
  p_accuracy double precision, p_observed_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  -- Serialize against session edits/cancellation while checking its meeting point.
  perform 1 from public.run_sessions where id = p_session_id for share;
  perform public.check_session_photo_location(p_session_id, p_lat, p_lon, p_accuracy, p_observed_at);
  insert into public.session_posts(session_id, author_id, caption, location_verified_at)
    values (p_session_id, auth.uid(), nullif(btrim(p_caption), ''), now()) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.check_session_photo_location(uuid, double precision, double precision, double precision, timestamptz),
  public.create_session_photo_post(uuid, text, double precision, double precision, double precision, timestamptz) from public, anon;
grant execute on function public.check_session_photo_location(uuid, double precision, double precision, double precision, timestamptz),
  public.create_session_photo_post(uuid, text, double precision, double precision, double precision, timestamptz) to authenticated;

alter policy session_media_insert_member on public.session_media
  with check (uploader_id = (select auth.uid()) and exists (
    select 1 from public.session_posts p where p.id = post_id
      and p.author_id = (select auth.uid()) and public.can_post_to_session(p.session_id)
      and p.location_verified_at > now() - interval '15 minutes'
  ));
alter policy session_media_objects_insert_own_folder on storage.objects
  with check (
    bucket_id = 'session-media' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.session_posts p
      where p.id::text = (storage.foldername(name))[2] and p.author_id = (select auth.uid())
        and public.can_post_to_session(p.session_id)
        and p.location_verified_at > now() - interval '15 minutes')
  );
