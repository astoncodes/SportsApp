begin;
select plan(3);
insert into auth.users (id, email, raw_user_meta_data) values
('95555555-5555-4555-8555-555555555551', 'a@example.test', '{}'),
('95555555-5555-4555-8555-555555555552', repeat('a', 60) || '@example.test', '{}'),
('95555555-5555-4555-8555-555555555553', 'normal@example.test', jsonb_build_object('display_name', 'a' || repeat(' ', 40) || 'b'));
select is((select display_name from public.profiles where id = '95555555-5555-4555-8555-555555555551'), 'Player', 'one-character email still creates an account');
select is((select char_length(display_name) from public.profiles where id = '95555555-5555-4555-8555-555555555552'), 40, 'long email creates a bounded profile name');
select is((select display_name from public.profiles where id = '95555555-5555-4555-8555-555555555553'), 'Player', 'truncation cannot leave an invalid name');
select * from finish();
rollback;
