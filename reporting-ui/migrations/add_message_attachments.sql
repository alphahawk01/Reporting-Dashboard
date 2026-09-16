-- Message attachments: let messages carry a file (image / video / document).
-- Files are stored in a public Supabase Storage bucket and the message row
-- keeps the public URL + display name + kind, mirroring the LMS message shape.

alter table public.messages
    add column if not exists attachment_url  text,
    add column if not exists attachment_name text,
    -- 'image' | 'video' | 'document'
    add column if not exists attachment_type text;

-- Public bucket for message attachments. `public = true` so getPublicUrl()
-- links resolve without signed URLs (matches the app's open, anon-key posture).
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', true)
on conflict (id) do update set public = true;

-- Storage access policies. The app uses the anon key for everything, so allow
-- the anon (and authenticated) roles to read/write objects in THIS bucket
-- only. Scoped to the bucket so other buckets are unaffected.
drop policy if exists "message attachments read" on storage.objects;
create policy "message attachments read"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id = 'message-attachments');

drop policy if exists "message attachments insert" on storage.objects;
create policy "message attachments insert"
    on storage.objects for insert
    to anon, authenticated
    with check (bucket_id = 'message-attachments');

-- Allow overwrite/removal of objects in this bucket (e.g. re-upload).
drop policy if exists "message attachments update" on storage.objects;
create policy "message attachments update"
    on storage.objects for update
    to anon, authenticated
    using (bucket_id = 'message-attachments');

drop policy if exists "message attachments delete" on storage.objects;
create policy "message attachments delete"
    on storage.objects for delete
    to anon, authenticated
    using (bucket_id = 'message-attachments');
