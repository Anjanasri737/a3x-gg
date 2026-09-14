do $$
declare t text;
begin
  foreach t in array array['leads','conversation_library_rows','conversation_library_buckets','lead_journey_steps','lead_journey_progress','next_actions','screenshot_observations','conversation_states','work_claims','profiles']
  loop
    execute format('grant select on public.%I to anon', t);
    execute format('drop policy if exists "public read %s" on public.%I', t, t);
    execute format('create policy "public read %s" on public.%I for select to anon using (true)', t, t);
  end loop;
end $$;