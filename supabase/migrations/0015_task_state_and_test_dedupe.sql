-- Batch one, part 1: clean the examiner trail and give the Home inbox memory.

-- Concurrent page loads double-inserted identical covenant tests (same result,
-- same moment). Keep the earliest of any identical pair logged within 10 minutes.
delete from covenant_tests a
using covenant_tests b
where a.covenant_id = b.covenant_id
  and a.actual = b.actual
  and a.status = b.status
  and a.id > b.id
  and abs(extract(epoch from (a.tested_at - b.tested_at))) < 600;

-- Home-inbox state: checking a task off means it STAYS off.
create table if not exists task_state (
  org_id uuid not null references orgs(id) on delete cascade,
  key text not null,
  state text not null check (state in ('done', 'snoozed')),
  until date,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (org_id, key)
);
alter table task_state enable row level security;
drop policy if exists task_state_rw on task_state;
create policy task_state_rw on task_state
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
