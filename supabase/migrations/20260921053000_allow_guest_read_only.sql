grant select on table public.profiles to anon;
grant select on table public.study_entries to anon;

create policy "Guests can read profiles"
on public.profiles
for select
to anon
using (true);

create policy "Guests can read all entries"
on public.study_entries
for select
to anon
using (true);
