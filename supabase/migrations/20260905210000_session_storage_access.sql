-- Uploads must belong to a post authored by the caller in a joined session.
drop policy session_media_objects_insert_own_folder on storage.objects;
create policy session_media_objects_insert_own_folder
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'session-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.session_posts p
      where p.id::text = (storage.foldername(name))[2]
        and p.author_id = (select auth.uid())
        and public.is_session_member(p.session_id)
    )
  );

-- Storage's remove API needs SELECT as well as DELETE for owned objects.
create policy session_media_objects_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'session-media'
    and owner_id = (select auth.uid())::text
  );

alter table public.session_media add constraint session_media_owned_path check (
  storage_path is null or (
    split_part(storage_path, '/', 1) = uploader_id::text
    and split_part(storage_path, '/', 2) = post_id::text
  )
);
