-- Account profile RPC: authentication, transactional sport replacement, and
-- owner-only state are enforced in Postgres rather than trusted to the app.

begin;
select plan(9);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '81111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'account-owner@example.test'),
  ('00000000-0000-0000-0000-000000000000', '82222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'account-other@example.test');

create temporary table test_inactive_sport as
select id from public.sports where slug = 'ice-hockey';
grant select on test_inactive_sport to authenticated;

set local role anon;

select throws_ok(
  $$ select public.update_own_profile('Anonymous', array[]::bigint[], true) $$,
  '42501',
  null,
  'anonymous callers cannot update a profile'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '81111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.update_own_profile(
       'Taylor R.',
       array[
         (select id from public.sports where slug = 'basketball'),
         (select id from public.sports where slug = 'soccer')
       ],
       true
     ) $$,
  'the owner can complete their account profile'
);

select is(
  (select (public.current_profile()).display_name),
  'Taylor R.',
  'the display name is trimmed and saved'
);

select isnt(
  (select (public.current_profile()).onboarding_completed_at),
  null,
  'completing onboarding records a timestamp'
);

select is(
  (select count(*)::integer from public.profile_sports),
  2,
  'selected sport preferences are saved'
);

select throws_ok(
  $$ select public.update_own_profile(
       'Taylor R.',
       array[(select id from test_inactive_sport)],
       true
     ) $$,
  '22023',
  null,
  'inactive sports are rejected'
);

select is(
  (select count(*)::integer from public.profile_sports),
  2,
  'a rejected update leaves existing sports intact'
);

select lives_ok(
  $$ select public.update_own_profile('Taylor R.', array[]::bigint[], true) $$,
  'the owner may clear all sport preferences later'
);

select is_empty(
  $$ select 1 from public.profile_sports $$,
  'clearing preferences removes all selected sports'
);

reset role;
select * from finish();
rollback;
