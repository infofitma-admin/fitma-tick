-- ============================================================================
-- Fitma Tick (Cloud) — Screenshots storage bucket + access policies
-- Path convention for every object:  <company_id>/<user_id>/<filename>
-- ============================================================================

-- Private bucket (never public); 5 MB cap; images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 5242880,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- A member can upload ONLY under their own user folder, in a company they belong to.
drop policy if exists "ss_upload_own" on storage.objects;
create policy "ss_upload_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[2] = auth.uid()::text
    and is_member(((storage.foldername(name))[1])::uuid)
  );

-- A member reads their own screenshots; a manager reads the whole company's.
drop policy if exists "ss_read_own_or_mgr" on storage.objects;
create policy "ss_read_own_or_mgr" on storage.objects for select to authenticated
  using (
    bucket_id = 'screenshots'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or is_manager(((storage.foldername(name))[1])::uuid)
    )
  );
