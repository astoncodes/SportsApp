-- Dated run sessions, participant-only chat, and a public regional activity
-- feed. A recurring run is a template; this migration gives an individual
-- week's occurrence a stable identity that messages and media can reference.

create type public.session_member_role as enum ('organizer', 'player');
create type public.session_media_kind as enum ('image', 'video');

create table public.run_sessions (
  id              uuid primary key default gen_random_uuid(),
  run_series_id   uuid not null references public.run_series (id) on delete cascade,
  occurrence_date date not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  venue_id        uuid not null references public.venues (id) on delete restrict,
  sport_id        bigint not null references public.sports (id) on delete restrict,
  region_id       bigint not null references public.regions (id) on delete restrict,
  created_at      timestamptz not null default now(),

  unique (run_series_id, occurrence_date),
  constraint run_sessions_time_order check (ends_at > starts_at)
);

create table public.session_memberships (
  session_id uuid not null references public.run_sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.session_member_role not null default 'player',
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.session_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.run_sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),

  constraint session_messages_body_length check (
    char_length(btrim(body)) between 1 and 1000
  )
);

create table public.session_posts (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.run_sessions (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  caption    text,
  created_at timestamptz not null default now(),

  constraint session_posts_caption_length check (
    caption is null or char_length(btrim(caption)) between 1 and 500
  )
);

create table public.session_media (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references public.session_posts (id) on delete cascade,
  uploader_id      uuid not null references auth.users (id) on delete cascade,
  kind             public.session_media_kind not null,
  storage_path     text unique,
  remote_url       text,
  width            integer,
  height           integer,
  duration_seconds numeric(6,2),
  created_at       timestamptz not null default now(),

  constraint session_media_has_one_source check (
    (storage_path is not null)::integer + (remote_url is not null)::integer = 1
  ),
  constraint session_media_path_safe check (
    storage_path is null
    or (storage_path = btrim(storage_path) and storage_path !~ '(^|/)\.\.(/|$)')
  ),
  constraint session_media_remote_url_safe check (
    remote_url is null or remote_url ~ '^https://'
  ),
  constraint session_media_dimensions_positive check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  constraint session_media_video_duration check (
    (kind = 'image' and duration_seconds is null)
    or (kind = 'video' and duration_seconds > 0 and duration_seconds <= 30)
  )
);

create index session_memberships_user_idx
  on public.session_memberships (user_id, joined_at desc);
create index session_messages_session_idx
  on public.session_messages (session_id, created_at);
create index session_posts_created_idx
  on public.session_posts (created_at desc);
create index run_sessions_region_idx
  on public.run_sessions (region_id, starts_at desc);

-- SECURITY DEFINER avoids recursive membership RLS checks. It exposes only a
-- boolean for the current user and never returns the membership row.
create or replace function public.is_session_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.session_memberships m
     where m.session_id = p_session_id
       and m.user_id = (select auth.uid())
  )
$$;

revoke all on function public.is_session_member(uuid) from public;
grant execute on function public.is_session_member(uuid) to authenticated;

revoke all on public.run_sessions, public.session_memberships,
  public.session_messages, public.session_posts, public.session_media
  from anon, authenticated;

alter table public.run_sessions enable row level security;
alter table public.session_memberships enable row level security;
alter table public.session_messages enable row level security;
alter table public.session_posts enable row level security;
alter table public.session_media enable row level security;

create policy run_sessions_select_public
  on public.run_sessions for select to anon, authenticated using (true);
grant select on public.run_sessions to anon, authenticated;

create policy session_memberships_select_session
  on public.session_memberships for select to authenticated
  using (public.is_session_member(session_id));
grant select on public.session_memberships to authenticated;

create policy session_messages_select_member
  on public.session_messages for select to authenticated
  using (public.is_session_member(session_id));
create policy session_messages_insert_member
  on public.session_messages for insert to authenticated
  with check (
    user_id = (select auth.uid()) and public.is_session_member(session_id)
  );
grant select, insert on public.session_messages to authenticated;

create policy session_posts_select_public
  on public.session_posts for select to anon, authenticated using (true);
create policy session_posts_insert_member
  on public.session_posts for insert to authenticated
  with check (
    author_id = (select auth.uid()) and public.is_session_member(session_id)
  );
create policy session_posts_delete_own
  on public.session_posts for delete to authenticated
  using (author_id = (select auth.uid()));
grant select on public.session_posts to anon, authenticated;
grant insert, delete on public.session_posts to authenticated;

create policy session_media_select_public
  on public.session_media for select to anon, authenticated using (true);
create policy session_media_insert_member
  on public.session_media for insert to authenticated
  with check (
    uploader_id = (select auth.uid())
    and exists (
      select 1 from public.session_posts p
       where p.id = post_id
         and p.author_id = (select auth.uid())
         and public.is_session_member(p.session_id)
    )
  );
create policy session_media_delete_own
  on public.session_media for delete to authenticated
  using (uploader_id = (select auth.uid()));
grant select on public.session_media to anon, authenticated;
grant insert, delete on public.session_media to authenticated;

-- Lazily materialize one valid dated occurrence and join the caller. The
-- organizer is always added as a member, even when another player joins first.
create or replace function public.join_run_session(
  p_run_series_id uuid,
  p_occurrence_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run record;
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select u.* into v_run
    from public.upcoming_runs(
      null, null, null,
      (p_occurrence_date::timestamp at time zone 'UTC') - interval '1 day',
      3
    ) u
   where u.run_series_id = p_run_series_id
     and u.occurrence_date = p_occurrence_date
   limit 1;

  if not found then
    raise exception 'run occurrence is unavailable' using errcode = '22023';
  end if;

  insert into public.run_sessions (
    run_series_id, occurrence_date, starts_at, ends_at,
    venue_id, sport_id, region_id
  )
  select v_run.run_series_id, v_run.occurrence_date, v_run.starts_at,
         v_run.ends_at, v_run.venue_id, v_run.sport_id, s.region_id
    from public.run_series s
   where s.id = v_run.run_series_id
  on conflict (run_series_id, occurrence_date) do update
    set starts_at = excluded.starts_at,
        ends_at = excluded.ends_at
  returning id into v_session_id;

  insert into public.session_memberships (session_id, user_id, role)
  values (v_session_id, v_run.organizer_id, 'organizer')
  on conflict (session_id, user_id) do update set role = 'organizer';

  insert into public.session_memberships (session_id, user_id, role)
  values (
    v_session_id,
    v_user_id,
    (case when v_user_id = v_run.organizer_id then 'organizer'
          else 'player' end)::public.session_member_role
  )
  on conflict (session_id, user_id) do nothing;

  return v_session_id;
end
$$;

revoke all on function public.join_run_session(uuid, date) from public;
grant execute on function public.join_run_session(uuid, date) to authenticated;

-- Public uploads are immutable objects; metadata and ownership still live in
-- public.session_media. Paths begin with the uploader's user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-media', 'session-media', true, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy session_media_objects_insert_own_folder
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'session-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy session_media_objects_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'session-media'
    and owner_id = (select auth.uid())::text
  );
