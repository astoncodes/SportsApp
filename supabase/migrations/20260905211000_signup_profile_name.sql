-- Signup must work for short/long email local parts and arbitrary metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(new.raw_user_meta_data ->> 'display_name');
begin
  if v_name is null or char_length(v_name) < 2 then
    v_name := btrim(split_part(coalesce(new.email, ''), '@', 1));
  end if;
  if v_name is null or char_length(v_name) < 2 then
    v_name := 'Player';
  end if;
  v_name := btrim(left(v_name, 40));
  if char_length(v_name) < 2 then
    v_name := 'Player';
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, v_name)
  on conflict (id) do nothing;
  return new;
end;
$$;
