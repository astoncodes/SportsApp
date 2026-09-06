-- Create a weekly run and its first dated session in one transaction.
create function public.create_run(
  p_venue_id uuid, p_sport_id bigint, p_starts_on date,
  p_start_time time, p_end_time time, p_weeks integer, p_title text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_region bigint;
  v_timezone text;
  v_series uuid;
begin
  if v_user is null then
    raise exception 'Sign in to create a run' using errcode = '42501';
  end if;
  select v.region_id, r.timezone into v_region, v_timezone
  from public.venues v join public.regions r on r.id = v.region_id
  join public.venue_sports vs on vs.venue_id = v.id and vs.sport_id = p_sport_id
  join public.sports s on s.id = vs.sport_id and s.is_active
  where v.id = p_venue_id and v.status = 'active' and r.is_published;
  if not found then
    raise exception 'Choose an available venue and a sport played there' using errcode = '22023';
  end if;
  if p_starts_on is null or p_start_time is null or p_end_time is null
     or p_weeks is null or p_weeks not between 1 and 12
     or p_start_time >= p_end_time
     or p_starts_on > (now() at time zone v_timezone)::date + 84
     or (p_starts_on + p_start_time) at time zone v_timezone <= now()
     or p_title is null or char_length(btrim(p_title)) not between 2 and 80 then
    raise exception 'Use a future date within 12 weeks, an end time after the start, 1–12 weeks, and a title of 2–80 characters' using errcode = '22023';
  end if;
  insert into public.run_series (
    organizer_id, venue_id, sport_id, region_id, weekday,
    local_start_time, local_end_time, timezone, starts_on, valid_until, title
  ) values (
    v_user, p_venue_id, p_sport_id, v_region, extract(dow from p_starts_on)::smallint,
    p_start_time, p_end_time, v_timezone, p_starts_on, p_starts_on + (p_weeks - 1) * 7, btrim(p_title)
  ) returning id into v_series;
  return public.join_run_session(v_series, p_starts_on);
end;
$$;
revoke all on function public.create_run(uuid, bigint, date, time, time, integer, text) from public, anon;
grant execute on function public.create_run(uuid, bigint, date, time, time, integer, text) to authenticated;
