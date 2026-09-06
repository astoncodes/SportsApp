begin;
select plan(5);

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '93333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'storage-test@example.test', '{}');
select set_config('request.jwt.claims', '{"sub":"93333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('session-media', '93333333-3333-4333-8333-333333333333/no-post/photo.jpg', '93333333-3333-4333-8333-333333333333') $$,
  '42501', null, 'upload requires a real owned session post');

select set_config('test.storage_session', public.join_run_session(u.run_series_id, u.occurrence_date)::text, true)
from public.upcoming_runs(null, null, null, now(), 14) u limit 1;
select set_config('test.storage_post', public.create_session_photo_post(s.id, 'Storage test',
  extensions.st_y(v.location::extensions.geometry), extensions.st_x(v.location::extensions.geometry), 10, now())::text, true)
  from public.run_sessions s join public.venues v on v.id = s.venue_id
  where s.id = current_setting('test.storage_session')::uuid;

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('session-media', '93333333-3333-4333-8333-333333333333/' || current_setting('test.storage_post') || '/photo.jpg', '93333333-3333-4333-8333-333333333333') $$,
  'member can upload to their own post');
select is((select count(*)::integer from storage.objects where bucket_id = 'session-media'), 1,
  'uploader can select their object for cleanup');
select throws_ok(
  $$ insert into public.session_media (post_id, uploader_id, kind, storage_path)
     values (current_setting('test.storage_post')::uuid, '93333333-3333-4333-8333-333333333333', 'image', 'another-user/another-post/photo.jpg') $$,
  '23514', null, 'metadata cannot reference another owner or post path');
-- Storage restricts direct SQL deletes; its HTTP API sets this transaction flag.
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'session-media';
select is((select count(*)::integer from storage.objects where bucket_id = 'session-media'), 0,
  'uploader can remove their object');
reset role;
select * from finish();
rollback;
