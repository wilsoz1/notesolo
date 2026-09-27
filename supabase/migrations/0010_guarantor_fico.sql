-- Guarantor credit scores: filterable by the chat ("guarantor FICO below 700").
alter table guarantors add column if not exists fico int;

create or replace function seed_ficos(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update guarantors g set fico = v.fico
  from (values ('Priya Raman', 736), ('Marcus Ito', 684), ('Dana Whitfield', 758),
               ('Elena Voss', 712), ('Sam Ostrander', 701)) as v(name, fico)
  where g.name = v.name
    and g.fico is null
    and exists (select 1 from loans l where l.id = g.loan_id and l.org_id = p_org);
end $$;

select seed_ficos(id) from orgs;

do $do$
begin
  execute (
    select replace(pg_get_functiondef(p.oid),
                   'perform seed_financials(v_org); return v_org;',
                   'perform seed_financials(v_org); perform seed_ficos(v_org); return v_org;')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_org'
  );
end $do$;
