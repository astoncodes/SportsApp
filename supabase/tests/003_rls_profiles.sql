-- Profiles: automatic creation on signup, and the column-level boundary
-- between what other players may read and what stays private to the owner.
--
-- This file exercises the owner and the *other* authenticated user separately,
-- because "my own row" and "someone else's row" are the two cases a
-- row-level-only policy would happily conflate.

begin;
select plan(14);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'alice@example.test'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'bob@example.test');

-- ---------------------------------------------------------------------------
-- Signup trigger
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'inserting an auth user creates the matching profile automatically'
);

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'alice',
  'display_name falls back to the email local part when none is supplied'
);

-- Give alice something private to protect.
update public.profiles
   set home_region_id = (select id from public.regions where slug = 'charlottetown')
 where id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------
set local role anon;

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'alice',
  'anon can read a display name'
);

select throws_ok(
  $$ select home_region_id from public.profiles $$,
  '42501',
  null,
  'anon is denied home_region_id by column grant, not by policy'
);

-- ---------------------------------------------------------------------------
-- Authenticated, a different user
-- ---------------------------------------------------------------------------
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'alice',
  'another player can read a display name'
);

select throws_ok(
  $$ select onboarding_completed_at from public.profiles
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'another player cannot read private profile fields'
);

-- Filtered by the policy rather than rejected: the statement succeeds and
-- changes nothing, so the assertion checks that the name survived.
update public.profiles set display_name = 'hijacked'
 where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'alice',
  'a player cannot edit somebody else''s profile'
);

select throws_ok(
  $$ insert into public.profiles (id, display_name)
     values ('44444444-4444-4444-4444-444444444444', 'forged') $$,
  '42501',
  null,
  'profiles cannot be inserted through the API — only the signup trigger creates them'
);

-- ---------------------------------------------------------------------------
-- Authenticated, the owner
-- ---------------------------------------------------------------------------
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

update public.profiles set display_name = 'Alice B'
 where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice B',
  'the owner can update their own profile'
);

select is(
  (select (public.current_profile()).display_name),
  'Alice B',
  'current_profile() returns the caller''s own row'
);

select isnt(
  (select (public.current_profile()).home_region_id),
  null,
  'current_profile() exposes private fields that column grants hide from others'
);

-- ---------------------------------------------------------------------------
-- Sport preferences are owner-private
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.profile_sports (profile_id, sport_id)
     select '11111111-1111-1111-1111-111111111111', s.id
       from public.sports s where s.slug = 'basketball' $$,
  'a player can choose their own sports'
);

select throws_ok(
  $$ insert into public.profile_sports (profile_id, sport_id)
     select '22222222-2222-2222-2222-222222222222', s.id
       from public.sports s where s.slug = 'soccer' $$,
  '42501',
  null,
  'a player cannot set somebody else''s sport preferences'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is_empty(
  $$ select 1 from public.profile_sports
      where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  'sport preferences are not readable by other players'
);

reset role;
select * from finish();
rollback;
