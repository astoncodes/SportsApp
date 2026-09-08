begin;
select plan(11);
insert into auth.users (instance_id,id,aud,role,email,raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000','93333333-3333-4333-8333-333333333333','authenticated','authenticated','attendance@example.test','{"display_name":"Attendance"}');
select set_config('request.jwt.claims','{"sub":"93333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.session', public.create_run_at_pin(
  43.65,-79.38,'Attendance test spot',
  (select id from public.sports where is_active limit 1),
  current_date+1,'12:00','13:00',1,'Attendance test','UTC'
)::text,true);
select set_config('test.series',(select run_series_id::text from public.run_sessions where id=current_setting('test.session')::uuid),true);
select set_config('test.date',(select occurrence_date::text from public.run_sessions where id=current_setting('test.session')::uuid),true);
select lives_ok($$select public.set_run_attendance(current_setting('test.series')::uuid,current_setting('test.date')::date,'going')$$,'Going creates attendance');
select lives_ok($$select public.set_run_attendance(current_setting('test.series')::uuid,current_setting('test.date')::date,'going')$$,'Going can be repeated');
select is((select count(*)::integer from public.session_memberships where user_id=auth.uid()),1,'Repeated Going counts the player once');
select lives_ok($$select public.set_run_attendance(current_setting('test.series')::uuid,current_setting('test.date')::date,'maybe')$$,'Going can change to Maybe');
select is((select attendance from public.session_memberships where user_id=auth.uid()),'maybe','Maybe is persisted');
select is((select my_response from public.run_attendance(array[current_setting('test.series')::uuid]) where occurrence_date=current_setting('test.date')::date),'maybe','Summary returns own response');
select is((select going_count from public.run_attendance(array[current_setting('test.series')::uuid]) where session_id=current_setting('test.session')::uuid),0::bigint,'Maybe does not count as Going');
select is((select maybe_count from public.run_attendance(array[current_setting('test.series')::uuid]) where session_id=current_setting('test.session')::uuid),1::bigint,'Maybe counts once');
select throws_ok($$select public.set_run_attendance(current_setting('test.series')::uuid,current_setting('test.date')::date,'invalid')$$,'22023',null,'Invalid responses are rejected');
select throws_ok($$update public.session_memberships set attendance='going' where user_id=auth.uid()$$,'42501',null,'Direct updates cannot bypass the RPC');
reset role;
set local role anon;
select throws_ok($$select public.set_run_attendance(current_setting('test.series')::uuid,current_setting('test.date')::date,'going')$$,'42501',null,'Anonymous users cannot respond');
reset role;
select * from finish();
rollback;
