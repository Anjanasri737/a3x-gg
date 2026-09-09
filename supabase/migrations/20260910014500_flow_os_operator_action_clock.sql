alter table public.leads add column if not exists last_operator_action_at timestamptz;
create index if not exists leads_last_operator_action_idx on public.leads(last_operator_action_at);
