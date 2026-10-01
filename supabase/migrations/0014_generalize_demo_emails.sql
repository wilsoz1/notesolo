-- Finish the de-verticalization: demo email domains and note phrasing still
-- carried the old industry. Same approach as 0013 — rows plus seed functions.

create or replace function _swap(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(replace(
    t,
    'bluestemdental.com', 'bluestemlogistics.com'),
    'harborpointdental.com', 'harborpointgroup.com'),
    'cascadeortho.com', 'cascadecomponents.com'),
    'saguarodental.com', 'saguaromfg.com'),
    'riverbendmed.com', 'riverbendpartners.com'),
    'practice at 92% chair utilization', 'running at 92% capacity'),
    'chair utilization', 'capacity utilization')
$$;

update customers set email = _swap(email) where email is distinct from _swap(email);
update loan_notes set body = _swap(body) where body is distinct from _swap(body);
update outreach_attempts set recipient = _swap(recipient), body = _swap(body)
  where recipient is distinct from _swap(recipient) or body is distinct from _swap(body);

do $$
declare
  r record;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('dentistize_org', 'seed_servicing', 'seed_deals', 'seed_cashflows', 'seed_financials', 'seed_ficos')
  loop
    execute _swap(pg_get_functiondef(r.oid));
  end loop;
end $$;

drop function _swap(text);
