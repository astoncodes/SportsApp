begin;
select plan(9);

select ok(not has_function_privilege('anon', 'public.current_profile()', 'EXECUTE'),
  'Anonymous callers cannot request an account profile');
select ok(not has_function_privilege('anon', 'public.is_session_member(uuid)', 'EXECUTE'),
  'Anonymous callers cannot invoke the membership helper');
select ok(not has_function_privilege('anon', 'public.join_run_session(uuid,date)', 'EXECUTE'),
  'Joining requires a signed-in API role');
select ok(not has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  'Anonymous callers cannot invoke the Auth trigger function');
select ok(not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  'Signed-in callers cannot invoke the Auth trigger function');
select ok(has_function_privilege('authenticated', 'public.current_profile()', 'EXECUTE'),
  'Signed-in callers retain access to their profile');
select ok(has_function_privilege('authenticated', 'public.is_session_member(uuid)', 'EXECUTE'),
  'Membership policies retain the helper');
select ok(has_function_privilege('authenticated', 'public.join_run_session(uuid,date)', 'EXECUTE'),
  'Signed-in players retain session joining');
select ok(not has_function_privilege('anon', 'public.find_duplicate_candidates(double precision,double precision,bigint[],double precision,uuid,text)', 'EXECUTE'),
  'Anonymous browsing cannot invoke submission duplicate ranking');

select * from finish();
rollback;
