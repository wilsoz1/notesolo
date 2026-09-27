-- Three foundations from the roadmap:
--   1. covenant_tests — immutable test history (results stopped overwriting themselves)
--   2. borrower_portals — a borrower's tokenized door into their own relationship
--   3. doc_requests — what the bank is waiting for, and what arrived against it

create table covenant_tests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  covenant_id uuid not null references covenants(id) on delete cascade,
  loan_id uuid not null references loans(id) on delete cascade,
  tested_at timestamptz not null default now(),
  actual text not null,
  status text not null check (status in ('Pass','Near','Fail')),
  source text not null default 'auto'          -- auto (spread retest) | manual
);
create index on covenant_tests (covenant_id, tested_at desc);
alter table covenant_tests enable row level security;
create policy covenant_tests_all on covenant_tests for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));

create table borrower_portals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  token text not null unique,
  passcode text,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  access_count int not null default 0,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table borrower_portals enable row level security;
create policy borrower_portals_all on borrower_portals for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));

create table doc_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  loan_id uuid references loans(id) on delete set null,
  tickler_id uuid references ticklers(id) on delete set null,
  title text not null,
  note text,
  status text not null default 'open' check (status in ('open','received','accepted')),
  document_id uuid references documents(id) on delete set null,
  created_at timestamptz not null default now(),
  received_at timestamptz
);
create index on doc_requests (customer_id, status);
alter table doc_requests enable row level security;
create policy doc_requests_all on doc_requests for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));
