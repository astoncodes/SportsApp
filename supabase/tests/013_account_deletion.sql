begin;
select plan(12);
insert into auth.users(instance_id,id,aud,role,email,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000000','95555555-5555-4555-8555-555555555555','authenticated','authenticated','delete-owner@example.test','{"display_name":"Deletion Owner"}'),
('00000000-0000-0000-0000-000000000000','95555555-5555-4555-8555-555555555556','authenticated','authenticated','delete-peer@example.test','{"display_name":"Deletion Peer"}');
select set_config('request.jwt.claims','{"sub":"95555555-5555-4555-8555-555555555555","role":"authenticated"}',true);
set local role authenticated;
select ok(public.account_accepts_writes(),'Account accepts writes initially');
select throws_ok($$select public.prepare_account_deletion(auth.uid())$$,'42501',null,'Client cannot invoke privileged deletion staging');
select throws_ok($$select * from public.account_deletion_objects(auth.uid())$$,'42501',null,'Client cannot enumerate deletion manifests');
select throws_ok($$insert into public.account_deletion_requests(user_id) values(auth.uid())$$,'42501',null,'Client cannot forge deletion state');
select set_config('test.delete_session',public.create_run_at_pin(43.65,-79.38,'Deletion test spot',
(select id from public.sports where is_active limit 1),current_date+1,'12:00','13:00',1,'Deletion test','UTC')::text,true);
reset role;
insert into public.session_posts(id,session_id,author_id,caption) values
('95555555-5555-4555-8555-555555555557',current_setting('test.delete_session')::uuid,'95555555-5555-4555-8555-555555555555','Owner photo'),
('95555555-5555-4555-8555-555555555558',current_setting('test.delete_session')::uuid,'95555555-5555-4555-8555-555555555556','Peer photo');
insert into public.session_media(post_id,uploader_id,kind,storage_path) values
('95555555-5555-4555-8555-555555555557','95555555-5555-4555-8555-555555555555','image','95555555-5555-4555-8555-555555555555/95555555-5555-4555-8555-555555555557/owner.jpg'),
('95555555-5555-4555-8555-555555555558','95555555-5555-4555-8555-555555555556','image','95555555-5555-4555-8555-555555555556/95555555-5555-4555-8555-555555555558/peer.jpg');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select lives_ok($$select public.prepare_account_deletion('95555555-5555-4555-8555-555555555555')$$,'Server can stage deletion');
select lives_ok($$select public.prepare_account_deletion('95555555-5555-4555-8555-555555555555')$$,'Staging can be retried');
select is((select count(*)::integer from public.account_deletion_objects('95555555-5555-4555-8555-555555555555')),2,'Manifest retains owner and peer files from hosted sessions');
select is((select count(*)::integer from public.run_sessions where id=current_setting('test.delete_session')::uuid),0,'Hosted session metadata is removed');
reset role;
select set_config('request.jwt.claims','{"sub":"95555555-5555-4555-8555-555555555555","role":"authenticated"}',true);
set local role authenticated;
select ok(not public.account_accepts_writes(),'Deleting account no longer accepts writes');
select throws_ok($$update public.profiles set display_name='Still writing' where id=auth.uid()$$,'42501',null,'Old tokens cannot create new account data');
select is((select count(*)::integer from public.account_deletion_requests),1,'Owner can see deletion in progress');
reset role;
select set_config('request.jwt.claims','{"sub":"95555555-5555-4555-8555-555555555556","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.account_deletion_requests),0,'Another user cannot read deletion requests');
reset role;
select * from finish();
rollback;
