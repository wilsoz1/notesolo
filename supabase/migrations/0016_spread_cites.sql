-- Provenance follows the money: each spread line can carry its source cite
-- (page + the text the model read), same contract as the screener.
alter table financial_spreads add column if not exists cites jsonb not null default '{}'::jsonb;
