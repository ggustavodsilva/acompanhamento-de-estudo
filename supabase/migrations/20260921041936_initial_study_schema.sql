create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null unique,
  created_at timestamptz not null default now(),
  constraint profiles_display_name_allowed
    check (display_name in ('Tori', 'Misthios', 'Gaziim'))
);

create table public.study_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  study_date date not null,
  calculus_exercises integer not null default 0,
  calculus_note text not null default '',
  discrete_exercises integer not null default 0,
  discrete_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_entries_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint study_entries_user_date_unique unique (user_id, study_date),
  constraint study_entries_calculus_count_valid
    check (calculus_exercises between 0 and 10000),
  constraint study_entries_discrete_count_valid
    check (discrete_exercises between 0 and 10000),
  constraint study_entries_calculus_note_length
    check (char_length(calculus_note) <= 200),
  constraint study_entries_discrete_note_length
    check (char_length(discrete_note) <= 200)
);

create index idx_study_entries_date on public.study_entries (study_date);

alter table public.profiles enable row level security;
alter table public.study_entries enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.study_entries from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.study_entries to authenticated;
grant insert (
  user_id,
  study_date,
  calculus_exercises,
  calculus_note,
  discrete_exercises,
  discrete_note,
  updated_at
) on table public.study_entries to authenticated;
grant update (
  calculus_exercises,
  calculus_note,
  discrete_exercises,
  discrete_note,
  updated_at
) on table public.study_entries to authenticated;

create policy "Authenticated group members can read profiles"
on public.profiles
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated group members can read all entries"
on public.study_entries
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Users can insert their own non-future entry"
on public.study_entries
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and study_date <= (timezone('America/Sao_Paulo', now()))::date
);

create policy "Users can update their own non-future entry"
on public.study_entries
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and study_date <= (timezone('America/Sao_Paulo', now()))::date
);

comment on table public.profiles is 'Perfis fixos do grupo de estudos.';
comment on table public.study_entries is 'Um registro de exercícios por usuário e data.';
