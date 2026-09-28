-- Annual reviews: the pipeline's finish line. A review is a frozen snapshot of the
-- loan's facts (spreads, cash flow, covenant trail, payments, guarantors) plus a memo,
-- prepared by one person and approved by a different one — then published as a PDF,
-- logged on the loan, and its tickler completed.
create table annual_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  loan_id uuid not null references loans(id) on delete cascade,
  period text not null,                       -- e.g. '2026 annual review'
  status text not null default 'prepared' check (status in ('prepared','approved')),
  snapshot jsonb not null,                    -- immutable package data, captured at prepare time
  memo_md text,
  prepared_by text not null,
  prepared_by_user uuid references auth.users(id),
  approved_by text,
  approved_by_user uuid references auth.users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create index on annual_reviews (loan_id, created_at desc);
alter table annual_reviews enable row level security;
create policy annual_reviews_all on annual_reviews for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));
