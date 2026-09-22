alter table public.study_entries
  add column pre_calculus_exercises integer not null default 0,
  add column pre_calculus_note text not null default '',
  add constraint study_entries_pre_calculus_count_valid
    check (pre_calculus_exercises between 0 and 10000),
  add constraint study_entries_pre_calculus_note_length
    check (char_length(pre_calculus_note) <= 200);

grant insert (pre_calculus_exercises, pre_calculus_note) on table public.study_entries to authenticated;
grant update (pre_calculus_exercises, pre_calculus_note) on table public.study_entries to authenticated;
