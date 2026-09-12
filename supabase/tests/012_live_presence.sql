begin;
select plan(29);
insert into auth.users (instance_id,id,aud,role,email,raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000','94444444-4444-4444-8444-444444444444','authenticated','authenticated','presence@example.test','{"display_name":"Presence"}');
insert into public.venues(id,region_id,name,location)
select '94444444-4444-4444-8444-444444444445',id,'Presence test court',
  extensions.st_setsrid(extensions.st_makepoint(-63.13,46.24),4326)::extensions.geography
from public.regions where slug='charlottetown';
insert into public.venue_sports(venue_id,sport_id)
select '94444444-4444-4444-8444-444444444445',id from public.sports where slug='basketball';
select set_config('test.venue','94444444-4444-4444-8444-444444444445',true);
select set_config('test.sport',(select id::text from public.sports where slug='basketball'),true);
select set_config('request.jwt.claims','{"sub":"94444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,46.24,-63.13,101,now())$$,'22023',null,'Inaccurate location rejected');
select throws_ok($$select public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,46.24,-63.13,10,now()-interval '3 minutes')$$,'22023',null,'Stale reading rejected');
select throws_ok($$select public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,46.24,-63.13,10,now()+interval '1 minute')$$,'22023',null,'Future reading rejected');
select throws_ok($$select public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,47,-63.13,10,now())$$,'22023',null,'Distant check-in rejected');
select throws_ok($$select public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,'NaN',-63.13,10,now())$$,'22023',null,'Non-finite coordinate rejected');
select throws_ok($$select public.create_check_in(current_setting('test.venue')::uuid,-1,46.24,-63.13,10,now())$$,'22023',null,'Unsupported sport rejected');
select throws_ok($$select public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,46.24,-63.13,10,now(),29)$$,'22023',null,'Short duration rejected');
select throws_ok($$select public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,46.24,-63.13,10,now(),241)$$,'22023',null,'Long duration rejected');
select throws_ok($$select public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,46.24,-63.13,10,now(),90,21)$$,'22023',null,'Oversized party rejected');
select throws_ok($$select public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,46.24,-63.13,10,now(),90,1,repeat('a',121))$$,'22023',null,'Long note rejected');
select throws_ok($$select public.set_arrival_intent(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,20)$$,'22023',null,'Invalid ETA rejected');
select set_config('test.intent',public.set_arrival_intent(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,15)::text,true);
select set_config('test.intent2',public.set_arrival_intent(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,30)::text,true);
select ok((select cancelled_at is not null from public.arrival_intents where id=current_setting('test.intent')::uuid),'New arrival replaces previous intent');
select set_config('test.checkin',public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,46.24,-63.13,10,now(),90,5,'  Bring a ball  ')::text,true);
select is((select here_now from public.venue_details(current_setting('test.venue')::uuid)),5::integer,'Live count sums party size');
select is((select note from public.check_ins where id=current_setting('test.checkin')::uuid),'Bring a ball','Note is trimmed');
select ok((select location_verified and distance_to_venue_m=0 and reported_accuracy_m=10 from public.check_ins where id=current_setting('test.checkin')::uuid),'Only proximity verdict and measurements retained');
select is((select fulfilled_by_check_in_id from public.arrival_intents where id=current_setting('test.intent2')::uuid),current_setting('test.checkin')::uuid,'Check-in fulfills arrival intent');
select lives_ok($$select public.extend_check_in(current_setting('test.checkin')::uuid,30)$$,'Owner can extend');
select throws_ok($$select public.extend_check_in(current_setting('test.checkin')::uuid,121)$$,'22023',null,'Total window cannot exceed four hours');
select set_config('test.checkin2',public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,46.24,-63.13,10,now())::text,true);
select is((select end_reason::text from public.check_ins where id=current_setting('test.checkin')::uuid),'replaced','New check-in closes previous one');
select is((select count(*)::integer from public.check_ins where user_id=auth.uid() and ended_at is null),1,'One open check-in per user');
select throws_ok($$update public.check_ins set party_size=20 where user_id=auth.uid()$$,'42501',null,'Direct writes are denied');
select set_config('request.jwt.claims','{"sub":"5eed0001-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.end_check_in(current_setting('test.checkin2')::uuid)$$,'42501',null,'Another player cannot check out the owner');
select throws_ok($$select public.extend_check_in(current_setting('test.checkin2')::uuid)$$,'42501',null,'Another player cannot extend');
select throws_ok($$select public.cancel_arrival_intent(current_setting('test.intent2')::uuid)$$,'42501',null,'Another player cannot cancel intent');
select set_config('request.jwt.claims','{"sub":"94444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select lives_ok($$select public.end_check_in(current_setting('test.checkin2')::uuid)$$,'Owner can check out');
select is((select here_now from public.venue_details(current_setting('test.venue')::uuid)),0::integer,'Checkout immediately clears live count');
select throws_ok($$select public.extend_check_in(current_setting('test.checkin2')::uuid)$$,'22023',null,'Ended check-in cannot be extended');
reset role;
set local role anon;
select throws_ok($$select public.create_check_in(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint,46.24,-63.13,10,now())$$,'42501',null,'Anonymous check-in denied');
select throws_ok($$select public.set_arrival_intent(current_setting('test.venue')::uuid,current_setting('test.sport')::bigint)$$,'42501',null,'Anonymous arrival denied');
reset role;
select * from finish();
rollback;
