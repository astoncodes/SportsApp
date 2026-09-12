-- Complete the live-presence writes behind the existing read model. Coordinates
-- are used only to compute proximity; no submitted coordinate is retained.
-- SECURITY DEFINER is required because clients have read-only table grants:
-- all writes must pass the ownership, location and lifecycle checks below.

create function public.create_check_in(
  p_venue_id uuid,
  p_sport_id bigint,
  p_lat double precision,
  p_lon double precision,
  p_accuracy double precision,
  p_observed_at timestamptz,
  p_duration_minutes integer default 90,
  p_party_size integer default 1,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_venue public.venues;
  v_distance double precision;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in to check in.' using errcode = '42501';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 30 and 240 then
    raise exception 'Choose a duration between 30 minutes and 4 hours.' using errcode = '22023';
  end if;
  if p_party_size is null or p_party_size not between 1 and 20 then
    raise exception 'Party size must be between 1 and 20, including you.' using errcode = '22023';
  end if;
  if char_length(btrim(p_note)) > 120 then
    raise exception 'Keep your note to 120 characters.' using errcode = '22023';
  end if;
  if p_lat is null or not (p_lat between -90 and 90)
     or p_lon is null or not (p_lon between -180 and 180)
     or p_accuracy is null or not (p_accuracy between 0 and 100) then
    raise exception 'A location reading accurate to 100 metres or better is required.' using errcode = '22023';
  end if;
  if p_observed_at is null or p_observed_at < now() - interval '2 minutes'
     or p_observed_at > now() + interval '30 seconds' then
    raise exception 'Your location reading is too old. Please try again.' using errcode = '22023';
  end if;

  -- Every presence write for a player takes the same lock. Concurrent requests
  -- cannot both claim the single open-check-in or open-intent slot.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('presence:' || v_user::text, 0));
  select v.* into v_venue
    from public.venues v join public.regions r on r.id = v.region_id
    where v.id = p_venue_id and v.status = 'active' and r.is_published;
  if not found then
    raise exception 'This venue is not available for check-ins.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.venue_sports vs join public.sports s on s.id = vs.sport_id
    where vs.venue_id = p_venue_id and vs.sport_id = p_sport_id and s.is_active
  ) then
    raise exception 'Choose a sport available at this venue.' using errcode = '22023';
  end if;
  v_distance := extensions.st_distance(
    v_venue.location,
    extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography
  );
  if v_distance > 250 then
    raise exception 'Move within 250 metres of the venue to check in.' using errcode = '22023';
  end if;

  update public.check_ins set ended_at = now(),
    end_reason = case when expires_at <= now() then 'expired'::public.check_in_end_reason
                      else 'replaced'::public.check_in_end_reason end
    where user_id = v_user and ended_at is null;
  insert into public.check_ins (
    user_id, venue_id, region_id, sport_id, party_size, note, expires_at,
    location_verified, distance_to_venue_m, reported_accuracy_m
  ) values (
    v_user, v_venue.id, v_venue.region_id, p_sport_id, p_party_size, nullif(btrim(p_note), ''),
    now() + make_interval(mins => p_duration_minutes), true, v_distance, p_accuracy
  ) returning id into v_id;
  update public.arrival_intents set fulfilled_by_check_in_id = v_id
    where user_id = v_user and venue_id = p_venue_id and cancelled_at is null
      and fulfilled_by_check_in_id is null and expires_at > now();
  update public.arrival_intents set cancelled_at = now()
    where user_id = v_user and cancelled_at is null and fulfilled_by_check_in_id is null;
  return v_id;
end;
$$;

create function public.end_check_in(p_check_in_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Sign in to check out.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('presence:' || v_user::text, 0));
  if not exists (select 1 from public.check_ins where id = p_check_in_id and user_id = v_user) then
    raise exception 'Check-in not found.' using errcode = '42501';
  end if;
  update public.check_ins set ended_at = now(), end_reason = 'checkout'
    where id = p_check_in_id and user_id = v_user and ended_at is null;
end;
$$;

create function public.extend_check_in(p_check_in_id uuid, p_minutes integer default 30)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_check_in public.check_ins;
  v_expiry timestamptz;
begin
  if v_user is null then raise exception 'Sign in to extend a check-in.' using errcode = '42501'; end if;
  if p_minutes is null or p_minutes not between 1 and 240 then
    raise exception 'Choose an extension between 1 and 240 minutes.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('presence:' || v_user::text, 0));
  select * into v_check_in from public.check_ins where id = p_check_in_id and user_id = v_user;
  if not found then raise exception 'Check-in not found.' using errcode = '42501'; end if;
  if v_check_in.ended_at is not null or v_check_in.expires_at <= now() then
    raise exception 'This check-in has ended. Check in again with a fresh location reading.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.venues v join public.regions r on r.id = v.region_id
    where v.id = v_check_in.venue_id and v.status = 'active' and r.is_published
  ) then
    raise exception 'This venue is no longer available.' using errcode = '22023';
  end if;
  v_expiry := v_check_in.expires_at + make_interval(mins => p_minutes);
  if v_expiry > v_check_in.started_at + interval '4 hours' then
    raise exception 'A check-in lasts at most 4 hours. Check in again with a fresh location reading.' using errcode = '22023';
  end if;
  update public.check_ins set expires_at = v_expiry where id = p_check_in_id;
  return v_expiry;
end;
$$;

create function public.set_arrival_intent(p_venue_id uuid, p_sport_id bigint, p_eta_minutes integer default 30)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_region bigint;
  v_id uuid;
begin
  if v_user is null then raise exception 'Sign in to share that you are on your way.' using errcode = '42501'; end if;
  if p_eta_minutes is null or p_eta_minutes not in (15, 30, 60) then
    raise exception 'Choose an arrival time of 15, 30 or 60 minutes.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('presence:' || v_user::text, 0));
  select v.region_id into v_region from public.venues v join public.regions r on r.id = v.region_id
    where v.id = p_venue_id and v.status = 'active' and r.is_published;
  if not found then raise exception 'This venue is not available.' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.venue_sports vs join public.sports s on s.id = vs.sport_id
    where vs.venue_id = p_venue_id and vs.sport_id = p_sport_id and s.is_active
  ) then raise exception 'Choose a sport available at this venue.' using errcode = '22023'; end if;
  update public.arrival_intents set cancelled_at = now()
    where user_id = v_user and cancelled_at is null and fulfilled_by_check_in_id is null;
  insert into public.arrival_intents (user_id, venue_id, region_id, sport_id, eta_minutes, expires_at)
    values (v_user, p_venue_id, v_region, p_sport_id, p_eta_minutes, now() + make_interval(mins => p_eta_minutes))
    returning id into v_id;
  return v_id;
end;
$$;

create function public.cancel_arrival_intent(p_intent_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Sign in to cancel your arrival.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('presence:' || v_user::text, 0));
  if not exists (select 1 from public.arrival_intents where id = p_intent_id and user_id = v_user) then
    raise exception 'Arrival not found.' using errcode = '42501';
  end if;
  update public.arrival_intents set cancelled_at = now()
    where id = p_intent_id and user_id = v_user and cancelled_at is null and fulfilled_by_check_in_id is null;
end;
$$;

revoke all on function public.create_check_in(uuid,bigint,double precision,double precision,double precision,timestamptz,integer,integer,text) from public, anon, authenticated;
revoke all on function public.end_check_in(uuid) from public, anon, authenticated;
revoke all on function public.extend_check_in(uuid,integer) from public, anon, authenticated;
revoke all on function public.set_arrival_intent(uuid,bigint,integer) from public, anon, authenticated;
revoke all on function public.cancel_arrival_intent(uuid) from public, anon, authenticated;
grant execute on function public.create_check_in(uuid,bigint,double precision,double precision,double precision,timestamptz,integer,integer,text) to authenticated;
grant execute on function public.end_check_in(uuid) to authenticated;
grant execute on function public.extend_check_in(uuid,integer) to authenticated;
grant execute on function public.set_arrival_intent(uuid,bigint,integer) to authenticated;
grant execute on function public.cancel_arrival_intent(uuid) to authenticated;
