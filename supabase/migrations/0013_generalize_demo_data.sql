-- NoteSolo is for every commercial portfolio manager, not one vertical.
-- Rename the dental-flavored demo book to industry-neutral businesses —
-- existing rows in every org, and the seed functions so new orgs match.

create or replace function _swap(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    t,
    'Bluestem Pediatric Dental', 'Bluestem Logistics LLC'),
    'Cascade Orthodontics', 'Cascade Components Inc.'),
    'Harbor Point Dental Group', 'Harbor Point Hospitality Group'),
    'Riverbend Dental Partners LLC', 'Riverbend Partners LLC'),
    'Riverbend Dental Partners', 'Riverbend Partners'),
    'Saguaro Family Dentistry', 'Saguaro Manufacturing Co.'),
    'Dr. Alan Riverbend', 'Alan Riverbend'),
    'Mesa Ridge Dental Building', 'Mesa Ridge Commerce Building'),
    'dental office building', 'office building'),
    'practice A/R', 'business A/R'),
    'practice production report', 'production report'),
    'CBCT imaging + 4 operatory build-outs (invoice cost)', 'Production equipment + facility build-out (invoice cost)'),
    'Imaging & operatory equipment', 'Production equipment'),
    'operatory build-out', 'facility build-out')
$$;

update customers set company = _swap(company), name = _swap(name)
  where company is distinct from _swap(company) or name is distinct from _swap(name);
update guarantors set name = _swap(name) where name is distinct from _swap(name);
update loans set collateral = _swap(collateral) where collateral is distinct from _swap(collateral);
update ticklers set requirement = _swap(requirement) where requirement is distinct from _swap(requirement);
update covenants set name = _swap(name) where name is distinct from _swap(name);
update loan_notes set body = _swap(body) where body is distinct from _swap(body);

-- Seed functions carry the old names in their bodies: rewrite each in place.
do $$
declare
  r record;
  src text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('dentistize_org', 'seed_servicing', 'seed_deals', 'seed_cashflows', 'seed_financials', 'seed_ficos')
  loop
    src := _swap(pg_get_functiondef(r.oid));
    execute src;
  end loop;
end $$;

drop function _swap(text);
