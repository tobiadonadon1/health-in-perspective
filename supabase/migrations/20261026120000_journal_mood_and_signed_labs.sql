-- Optional mood on journal check-ins. Changing the mood keeps an existing AI reflection:
-- update_journal_entry() only discards reflections when the note text or date changes.
alter table public.journal_entries add column mood text check (mood in ('great','good','okay','low','rough'));
grant insert(mood),update(mood) on public.journal_entries to authenticated;

-- Some laboratory values are legitimately negative (e.g. base excess), so results and
-- reference limits accept signed values within the same magnitude bound.
alter table public.lab_results drop constraint lab_results_value_check;
alter table public.lab_results add constraint lab_results_value_check check (value between -1000000000 and 1000000000);
alter table public.lab_results drop constraint lab_results_reference_low_check;
alter table public.lab_results add constraint lab_results_reference_low_check check (reference_low between -1000000000 and 1000000000);
alter table public.lab_results drop constraint lab_results_reference_high_check;
alter table public.lab_results add constraint lab_results_reference_high_check check (reference_high between -1000000000 and 1000000000);
