begin;
select plan(15);

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '91111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'member@example.test', '{"display_name":"Member"}'),
  ('00000000-0000-0000-0000-000000000000', '92222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'outsider@example.test', '{"display_name":"Outsider"}');

select has_table('public', 'run_sessions', 'dated sessions exist');
select has_table('public', 'session_memberships', 'session memberships exist');
select has_table('public', 'session_messages', 'private messages exist');
select has_table('public', 'session_posts', 'public session posts exist');
select has_table('public', 'session_media', 'post media exists');

select set_config('request.jwt.claims', json_build_object('sub', '91111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ select set_config(
       'test.joined_session_id',
       public.join_run_session(u.run_series_id, u.occurrence_date)::text,
       true
     )
       from public.upcoming_runs(null, null, null, now(), 14) u limit 1 $$,
  'an authenticated player can join a valid dated occurrence'
);

select is(
  (select count(*)::integer from public.session_memberships
    where session_id = current_setting('test.joined_session_id')::uuid),
  3,
  'the joining player can see every member of the session they joined'
);

select lives_ok(
  $$ insert into public.session_messages (session_id, user_id, body)
     values (current_setting('test.joined_session_id')::uuid,
             '91111111-1111-4111-8111-111111111111', 'See you there') $$,
  'a member can send a session message'
);

select lives_ok(
  $$ insert into public.session_posts (session_id, author_id, caption)
     values (current_setting('test.joined_session_id')::uuid,
             '91111111-1111-4111-8111-111111111111', 'Great run tonight') $$,
  'a member can publish a feed post'
);

select throws_ok(
  $$ insert into public.session_media (post_id, uploader_id, kind, storage_path, duration_seconds)
     select id, '91111111-1111-4111-8111-111111111111', 'video', 'test/long.mp4', 31
       from public.session_posts
      where author_id = '91111111-1111-4111-8111-111111111111' limit 1 $$,
  '23514', null, 'clips are capped at thirty seconds'
);

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '92222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty($$ select 1 from public.session_messages $$,
  'a non-member cannot read session chat');

select throws_ok(
  $$ insert into public.session_messages (session_id, user_id, body)
     values (current_setting('test.joined_session_id')::uuid,
             '92222222-2222-4222-8222-222222222222', 'Let me in') $$,
  '42501', null, 'a non-member cannot write session chat'
);

select is((select count(*)::integer from public.session_posts), 4,
  'public feed posts remain visible to a non-member');

reset role;
set local role anon;
select is((select count(*)::integer from public.session_posts), 4,
  'public feed posts are visible without an account');
select throws_ok(
  $$ select public.join_run_session(u.run_series_id, u.occurrence_date)
       from public.upcoming_runs(null, null, null, now(), 14) u limit 1 $$,
  '42501', null, 'anonymous users cannot join sessions'
);

reset role;
select * from finish();
rollback;
