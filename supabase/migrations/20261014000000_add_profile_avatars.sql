alter table public.profiles
  add column avatar_path text,
  add constraint profiles_avatar_path_length
    check (avatar_path is null or char_length(avatar_path) <= 500);

grant update (avatar_path) on table public.profiles to authenticated;

create policy "Users can update their own avatar"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can view their own profile avatar objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-avatars'
  and owner_id = (select auth.uid()::text)
);

create policy "Users can upload their own profile avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can delete their own profile avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and owner_id = (select auth.uid()::text)
);
