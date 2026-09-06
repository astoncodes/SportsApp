-- Transactional owner profile updates for onboarding and account settings.
-- The public profile table remains protected by its existing column grants;
-- callers receive only their own complete row from this RPC.

create or replace function public.update_own_profile(
  p_display_name text,
  p_sport_ids bigint[],
  p_complete_onboarding boolean default true
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := btrim(p_display_name);
  v_sport_count integer;
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if char_length(v_display_name) not between 2 and 40 then
    raise exception 'Display name must be between 2 and 40 characters'
      using errcode = '22023';
  end if;

  if p_sport_ids is null then
    p_sport_ids := array[]::bigint[];
  end if;

  select count(distinct s.id)::integer
    into v_sport_count
    from public.sports s
   where s.id = any (p_sport_ids)
     and s.is_active;

  if v_sport_count <> (select count(distinct x) from unnest(p_sport_ids) x) then
    raise exception 'Every selected sport must exist and be active' using errcode = '22023';
  end if;

  update public.profiles p
     set display_name = v_display_name,
         onboarding_completed_at = case
           when p_complete_onboarding then coalesce(p.onboarding_completed_at, now())
           else p.onboarding_completed_at
         end
   where p.id = v_user_id
   returning p.* into v_profile;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  delete from public.profile_sports ps where ps.profile_id = v_user_id;

  insert into public.profile_sports (profile_id, sport_id)
  select v_user_id, s.id
    from public.sports s
   where s.id = any (p_sport_ids);

  return v_profile;
end
$$;

comment on function public.update_own_profile(text, bigint[], boolean) is
  'Transactionally updates the caller display name, onboarding state, and private sport preferences.';

revoke all on function public.update_own_profile(text, bigint[], boolean) from public, anon;
grant execute on function public.update_own_profile(text, bigint[], boolean) to authenticated;
