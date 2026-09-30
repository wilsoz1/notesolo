// Shared contract between the extraction backend and the UI.
// The backend returns `fields` keyed by FIELD_DEFS keys; the UI owns labels/sections and underwriting math.

export type Field = { text: string | null; number: number | null; confidence: number; page: number | null }
export type MemoKind =
  | 'cre_property' | 'operating_company' | 'personal_tax_return' | 'personal_financial_statement'
  | 'bank_statement' | 'debt_schedule' | 'practice_production_report' | 'purchase_agreement' | 'other'
export type DealSheet = {
  kind?: MemoKind // absent (older payloads) means cre_property
  source: { filename: string; pages: number; ocr: string }
  fields: Record<string, Field>
}

export type Section = 'Property' | 'Rent Roll & Occupancy' | 'Income & Expenses' | 'Pricing' | 'Loan Request' | 'Sponsor'
export type FieldDef = { key: string; label: string; section: Section; fmt?: 'money' | 'pct' | 'num' | 'x' | 'text' }

export const FIELD_DEFS: FieldDef[] = [
  { key: 'property_name', label: 'Property name', section: 'Property' },
  { key: 'address', label: 'Address', section: 'Property' },
  { key: 'property_type', label: 'Property type', section: 'Property' },
  { key: 'year_built', label: 'Year built / renovated', section: 'Property' },
  { key: 'building_sf', label: 'Building SF', section: 'Property', fmt: 'num' },
  { key: 'land_acres', label: 'Land (acres)', section: 'Property', fmt: 'num' },
  { key: 'units', label: 'Units / suites', section: 'Property', fmt: 'num' },
  { key: 'parking', label: 'Parking', section: 'Property' },
  { key: 'occupancy', label: 'Occupancy', section: 'Rent Roll & Occupancy', fmt: 'pct' },
  { key: 'tenant_count', label: 'Tenants', section: 'Rent Roll & Occupancy', fmt: 'num' },
  { key: 'anchor_tenants', label: 'Anchor / major tenants', section: 'Rent Roll & Occupancy' },
  { key: 'walt_years', label: 'WALT (years)', section: 'Rent Roll & Occupancy', fmt: 'num' },
  { key: 'avg_rent_psf', label: 'Avg in-place rent / SF', section: 'Rent Roll & Occupancy', fmt: 'money' },
  { key: 'gross_potential_rent', label: 'Gross potential rent', section: 'Income & Expenses', fmt: 'money' },
  { key: 'vacancy_loss', label: 'Vacancy & credit loss', section: 'Income & Expenses', fmt: 'money' },
  { key: 'other_income', label: 'Other income / reimbursements', section: 'Income & Expenses', fmt: 'money' },
  { key: 'effective_gross_income', label: 'Effective gross income', section: 'Income & Expenses', fmt: 'money' },
  { key: 'operating_expenses', label: 'Operating expenses', section: 'Income & Expenses', fmt: 'money' },
  { key: 'real_estate_taxes', label: 'Real estate taxes', section: 'Income & Expenses', fmt: 'money' },
  { key: 'insurance', label: 'Insurance', section: 'Income & Expenses', fmt: 'money' },
  { key: 'noi_in_place', label: 'NOI (in-place / T-12)', section: 'Income & Expenses', fmt: 'money' },
  { key: 'noi_pro_forma', label: 'NOI (pro forma / Yr 1)', section: 'Income & Expenses', fmt: 'money' },
  { key: 'purchase_price', label: 'Purchase price', section: 'Pricing', fmt: 'money' },
  { key: 'price_psf', label: 'Price / SF', section: 'Pricing', fmt: 'money' },
  { key: 'cap_rate', label: 'Cap rate (stated)', section: 'Pricing', fmt: 'pct' },
  { key: 'closing_date', label: 'Target closing', section: 'Pricing' },
  { key: 'broker', label: 'Broker / listing firm', section: 'Pricing' },
  { key: 'loan_amount', label: 'Loan request', section: 'Loan Request', fmt: 'money' },
  { key: 'loan_ltv', label: 'Requested LTV', section: 'Loan Request', fmt: 'pct' },
  { key: 'loan_term', label: 'Requested term / amortization', section: 'Loan Request' },
  { key: 'rate_request', label: 'Rate request / assumption', section: 'Loan Request' },
  { key: 'equity', label: 'Sponsor equity', section: 'Loan Request', fmt: 'money' },
  { key: 'use_of_proceeds', label: 'Use of proceeds', section: 'Loan Request' },
  { key: 'sponsor', label: 'Sponsor / borrower entity', section: 'Sponsor' },
  { key: 'sponsor_experience', label: 'Sponsor track record', section: 'Sponsor' },
  { key: 'guarantor', label: 'Guarantor(s)', section: 'Sponsor' },
  { key: 'sponsor_net_worth', label: 'Guarantor net worth', section: 'Sponsor', fmt: 'money' },
  { key: 'sponsor_liquidity', label: 'Guarantor liquidity', section: 'Sponsor', fmt: 'money' },
]

export const SECTIONS: Section[] = ['Property', 'Rent Roll & Occupancy', 'Income & Expenses', 'Pricing', 'Loan Request', 'Sponsor']

// ——— Operating-company track: an operating business and its spread, not a building ———

export type BizSection = 'Company' | 'Financials — latest year' | 'Income statement detail' | 'Balance sheet (Schedule L)' | 'Prior year' | 'Loan Request' | 'Guarantors'
export type BizFieldDef = { key: string; label: string; section: BizSection; fmt?: 'money' | 'pct' | 'num' | 'x' | 'text' }

export const BIZ_FIELD_DEFS: BizFieldDef[] = [
  { key: 'company_name', label: 'Company', section: 'Company' },
  { key: 'entity_type', label: 'Entity type', section: 'Company' },
  { key: 'industry', label: 'Industry / specialty', section: 'Company' },
  { key: 'address', label: 'Address', section: 'Company' },
  { key: 'year_founded', label: 'Founded / operating since', section: 'Company' },
  { key: 'locations', label: 'Locations', section: 'Company' },
  { key: 'owners', label: 'Owners', section: 'Company' },
  { key: 'employee_count', label: 'Employees', section: 'Company', fmt: 'num' },
  { key: 'period_latest', label: 'Period', section: 'Financials — latest year' },
  { key: 'revenue', label: 'Revenue / gross receipts', section: 'Financials — latest year', fmt: 'money' },
  { key: 'cogs', label: 'Cost of goods sold', section: 'Financials — latest year', fmt: 'money' },
  { key: 'operating_expenses', label: 'Operating expenses', section: 'Financials — latest year', fmt: 'money' },
  { key: 'officer_comp', label: 'Officer compensation', section: 'Financials — latest year', fmt: 'money' },
  { key: 'ebitda', label: 'EBITDA', section: 'Financials — latest year', fmt: 'money' },
  { key: 'depreciation', label: 'Depreciation & amort.', section: 'Financials — latest year', fmt: 'money' },
  { key: 'interest_expense', label: 'Interest expense', section: 'Financials — latest year', fmt: 'money' },
  { key: 'net_income', label: 'Net / ordinary income', section: 'Financials — latest year', fmt: 'money' },
  { key: 'distributions', label: 'Distributions', section: 'Financials — latest year', fmt: 'money' },
  { key: 'total_debt', label: 'Total debt', section: 'Financials — latest year', fmt: 'money' },
  { key: 'tangible_net_worth', label: 'Tangible net worth', section: 'Financials — latest year', fmt: 'money' },
  { key: 'returns_allowances', label: 'Returns & allowances', section: 'Income statement detail', fmt: 'money' },
  { key: 'gross_profit', label: 'Gross profit', section: 'Income statement detail', fmt: 'money' },
  { key: 'salaries_wages', label: 'Salaries & wages', section: 'Income statement detail', fmt: 'money' },
  { key: 'repairs_maintenance', label: 'Repairs & maintenance', section: 'Income statement detail', fmt: 'money' },
  { key: 'rents', label: 'Rents', section: 'Income statement detail', fmt: 'money' },
  { key: 'taxes_licenses', label: 'Taxes & licenses', section: 'Income statement detail', fmt: 'money' },
  { key: 'advertising', label: 'Advertising', section: 'Income statement detail', fmt: 'money' },
  { key: 'other_deductions', label: 'Other deductions', section: 'Income statement detail', fmt: 'money' },
  { key: 'total_deductions', label: 'Total deductions', section: 'Income statement detail', fmt: 'money' },
  { key: 'bs_cash', label: 'Cash', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_accounts_receivable', label: 'Accounts receivable', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_inventory', label: 'Inventory', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_other_current_assets', label: 'Other current assets', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_fixed_assets_net', label: 'Buildings & equipment, net', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_other_assets', label: 'Other assets', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_total_assets', label: 'Total assets', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_accounts_payable', label: 'Accounts payable', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_current_ltd', label: 'Current portion, LTD', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_long_term_debt', label: 'Long-term debt', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_other_liabilities', label: 'Other liabilities', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_total_liabilities', label: 'Total liabilities', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'bs_equity', label: 'Equity / tangible net worth', section: 'Balance sheet (Schedule L)', fmt: 'money' },
  { key: 'period_prior', label: 'Period', section: 'Prior year' },
  { key: 'revenue_prior', label: 'Revenue', section: 'Prior year', fmt: 'money' },
  { key: 'ebitda_prior', label: 'EBITDA', section: 'Prior year', fmt: 'money' },
  { key: 'net_income_prior', label: 'Net income', section: 'Prior year', fmt: 'money' },
  { key: 'loan_amount', label: 'Loan request', section: 'Loan Request', fmt: 'money' },
  { key: 'loan_purpose', label: 'Purpose', section: 'Loan Request' },
  { key: 'loan_term', label: 'Requested term / amortization', section: 'Loan Request' },
  { key: 'rate_request', label: 'Rate request', section: 'Loan Request' },
  { key: 'equity_injection', label: 'Equity injection', section: 'Loan Request', fmt: 'money' },
  { key: 'collateral_offered', label: 'Collateral offered', section: 'Loan Request' },
  { key: 'guarantor', label: 'Guarantor(s)', section: 'Guarantors' },
  { key: 'guarantor_net_worth', label: 'Guarantor net worth', section: 'Guarantors', fmt: 'money' },
  { key: 'guarantor_liquidity', label: 'Guarantor liquidity', section: 'Guarantors', fmt: 'money' },
]

export const SECTIONS_BIZ: BizSection[] = ['Company', 'Financials — latest year', 'Income statement detail', 'Balance sheet (Schedule L)', 'Prior year', 'Loan Request', 'Guarantors']

// ——— Package spread: the two statements as ordered lines, years as columns ———
// `line` is the IRS form line so an underwriter can tie every row to the return.
export type SpreadLine = { key: string; label: string; line?: string; total?: boolean; deduct?: boolean; computed?: boolean }
export const IS_LINES: SpreadLine[] = [
  { key: 'revenue', label: 'Gross receipts', line: '1a' },
  { key: 'returns_allowances', label: 'Returns & allowances', line: '1b', deduct: true },
  { key: 'cogs', label: 'Cost of goods sold', line: '2', deduct: true },
  { key: 'gross_profit', label: 'Gross profit', line: '3', total: true },
  { key: 'officer_comp', label: 'Officer compensation', line: '7 · 1125-E', deduct: true },
  { key: 'salaries_wages', label: 'Salaries & wages', line: '8', deduct: true },
  { key: 'repairs_maintenance', label: 'Repairs & maintenance', line: '9', deduct: true },
  { key: 'rents', label: 'Rents', line: '11', deduct: true },
  { key: 'taxes_licenses', label: 'Taxes & licenses', line: '12', deduct: true },
  { key: 'interest_expense', label: 'Interest expense', line: '13', deduct: true },
  { key: 'depreciation', label: 'Depreciation', line: '14', deduct: true },
  { key: 'advertising', label: 'Advertising', line: '16', deduct: true },
  { key: 'other_deductions', label: 'Other deductions', line: '19', deduct: true },
  { key: 'total_deductions', label: 'Total deductions', line: '20', total: true, deduct: true },
  { key: 'net_income', label: 'Ordinary income', line: '21', total: true },
  { key: 'ebitda', label: 'EBITDA', line: 'computed', total: true, computed: true },
  { key: 'distributions', label: 'Distributions', line: 'Sch K · 16d', deduct: true },
]
export const BS_LINES: SpreadLine[] = [
  { key: 'bs_cash', label: 'Cash' },
  { key: 'bs_accounts_receivable', label: 'Accounts receivable' },
  { key: 'bs_inventory', label: 'Inventory' },
  { key: 'bs_other_current_assets', label: 'Other current assets' },
  { key: 'bs_fixed_assets_net', label: 'Buildings & equipment, net' },
  { key: 'bs_other_assets', label: 'Other assets' },
  { key: 'bs_total_assets', label: 'Total assets', total: true },
  { key: 'bs_accounts_payable', label: 'Accounts payable' },
  { key: 'bs_current_ltd', label: 'Current portion, LTD' },
  { key: 'bs_long_term_debt', label: 'Long-term debt' },
  { key: 'bs_other_liabilities', label: 'Other liabilities' },
  { key: 'bs_total_liabilities', label: 'Total liabilities', total: true },
  { key: 'bs_equity', label: 'Equity / tangible net worth', total: true },
]

// ——— The rest of a screening package: one flat section per document kind ———

type SimpleDef = { key: string; label: string; fmt?: 'money' | 'pct' | 'num' | 'x' | 'text' }
export const KIND_META: Record<string, { label: string; defs: SimpleDef[] }> = {
  cre_property: { label: 'Property offering memo', defs: [] },        // uses FIELD_DEFS
  operating_company: { label: 'Business financials', defs: [] },      // uses BIZ_FIELD_DEFS
  personal_tax_return: {
    label: 'Personal tax return',
    defs: [
      { key: 'taxpayer_name', label: 'Taxpayer' }, { key: 'tax_year', label: 'Tax year' },
      { key: 'filing_status', label: 'Filing status' }, { key: 'wages', label: 'Wages (W-2)', fmt: 'money' },
      { key: 'business_income', label: 'Business income (Sch C)', fmt: 'money' },
      { key: 'rental_income', label: 'Rental income (Sch E)', fmt: 'money' },
      { key: 'k1_income', label: 'K-1 / pass-through income', fmt: 'money' },
      { key: 'interest_dividends', label: 'Interest & dividends', fmt: 'money' },
      { key: 'total_income', label: 'Total income', fmt: 'money' }, { key: 'agi', label: 'AGI', fmt: 'money' },
      { key: 'total_tax', label: 'Total tax', fmt: 'money' },
    ],
  },
  personal_financial_statement: {
    label: 'Personal financial statement',
    defs: [
      { key: 'person_name', label: 'Name' }, { key: 'statement_date', label: 'Statement date' },
      { key: 'total_assets', label: 'Total assets', fmt: 'money' },
      { key: 'total_liabilities', label: 'Total liabilities', fmt: 'money' },
      { key: 'net_worth', label: 'Net worth', fmt: 'money' },
      { key: 'liquid_assets', label: 'Liquid assets', fmt: 'money' },
      { key: 'real_estate_value', label: 'Real estate', fmt: 'money' },
      { key: 'retirement_accounts', label: 'Retirement accounts', fmt: 'money' },
      { key: 'annual_income', label: 'Annual income', fmt: 'money' },
      { key: 'annual_debt_payments', label: 'Annual debt payments', fmt: 'money' },
      { key: 'contingent_liabilities', label: 'Contingent liabilities' },
    ],
  },
  bank_statement: {
    label: 'Bank statement',
    defs: [
      { key: 'account_holder', label: 'Account holder' }, { key: 'bank_name', label: 'Bank' },
      { key: 'account_type', label: 'Account type' }, { key: 'statement_period', label: 'Period' },
      { key: 'beginning_balance', label: 'Beginning balance', fmt: 'money' },
      { key: 'ending_balance', label: 'Ending balance', fmt: 'money' },
      { key: 'total_deposits', label: 'Total deposits', fmt: 'money' },
      { key: 'total_withdrawals', label: 'Total withdrawals', fmt: 'money' },
      { key: 'average_balance', label: 'Average balance', fmt: 'money' },
      { key: 'nsf_items', label: 'NSF / returned items', fmt: 'num' },
    ],
  },
  debt_schedule: {
    label: 'Debt schedule',
    defs: [
      { key: 'borrower_name', label: 'Borrower' }, { key: 'as_of_date', label: 'As of' },
      { key: 'creditor_count', label: 'Creditors', fmt: 'num' },
      { key: 'total_balance', label: 'Total balance', fmt: 'money' },
      { key: 'total_monthly_payment', label: 'Total monthly payment', fmt: 'money' },
      { key: 'total_annual_payment', label: 'Total annual payment', fmt: 'money' },
      { key: 'largest_creditor', label: 'Largest creditor' },
      { key: 'secured_balance', label: 'Secured balance', fmt: 'money' },
      { key: 'notes_over_100k', label: 'Notes over $100K' },
    ],
  },
  practice_production_report: {
    label: 'Production / operations report',
    defs: [
      { key: 'practice_name', label: 'Business' }, { key: 'report_period', label: 'Period' },
      { key: 'gross_production', label: 'Gross production', fmt: 'money' },
      { key: 'collections', label: 'Collections', fmt: 'money' },
      { key: 'collection_rate', label: 'Collection rate', fmt: 'pct' },
      { key: 'adjustments', label: 'Adjustments', fmt: 'money' },
      { key: 'active_patients', label: 'Active patients', fmt: 'num' },
      { key: 'new_patients_monthly', label: 'New patients / month', fmt: 'num' },
      { key: 'hygiene_production_pct', label: 'Hygiene production %', fmt: 'pct' },
      { key: 'chair_utilization', label: 'Chair utilization', fmt: 'pct' },
    ],
  },
  purchase_agreement: {
    label: 'Purchase agreement / LOI',
    defs: [
      { key: 'buyer', label: 'Buyer' }, { key: 'seller', label: 'Seller' },
      { key: 'target_name', label: 'Target' }, { key: 'purchase_price', label: 'Purchase price', fmt: 'money' },
      { key: 'included_assets', label: 'Included assets' }, { key: 'excluded_assets', label: 'Excluded assets' },
      { key: 'closing_date', label: 'Closing date' }, { key: 'earnest_money', label: 'Earnest money', fmt: 'money' },
      { key: 'seller_financing', label: 'Seller financing' }, { key: 'noncompete_terms', label: 'Non-compete' },
    ],
  },
  other: {
    label: 'Document',
    defs: [
      { key: 'document_title', label: 'Title' }, { key: 'parties', label: 'Parties' },
      { key: 'date', label: 'Date' }, { key: 'summary', label: 'Summary' },
    ],
  },
}

// ——— Underwriting (deterministic; bank policy defaults are editable in the UI) ———

export type Policy = { maxLtv: number; minDscr: number; minDebtYield: number; rate: number; amortYears: number; maxLeverage: number }
export const DEFAULT_POLICY: Policy = { maxLtv: 0.75, minDscr: 1.25, minDebtYield: 0.085, rate: 0.0675, amortYears: 25, maxLeverage: 4 }

export type Metric = { label: string; value: string; test?: string; status: 'pass' | 'fail' | 'na' }

const annualDebtService = (loan: number, rate: number, years: number) => {
  const r = rate / 12, n = years * 12
  return (loan * r / (1 - Math.pow(1 + r, -n))) * 12
}

// Operating company: the loan is repaid by business cash flow, so the tests are
// DSCR on EBITDA, post-close leverage, margin and trend — not LTV and cap rate.
export function underwriteBiz(fields: Record<string, Field>, p: Policy): Metric[] {
  const n = (k: string) => fields[k]?.number ?? null
  const loan = n('loan_amount'), ebitda = n('ebitda'), rev = n('revenue')
  const dist = n('distributions'), debt = n('total_debt'), revPrior = n('revenue_prior')
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  const money = (v: number) => `$${Math.round(v).toLocaleString()}`

  const ds = loan ? annualDebtService(loan, p.rate, p.amortYears) : null
  const dscr = ds && ebitda ? ebitda / ds : null
  const fcc = ds && ebitda != null && dist != null ? (ebitda - dist) / ds : null
  const lev = ebitda && debt != null && loan != null ? (debt + loan) / ebitda : null
  const margin = rev && ebitda != null ? ebitda / rev : null
  const growth = rev && revPrior ? rev / revPrior - 1 : null
  const maxLoanDscr = ebitda ? (ebitda / p.minDscr) / annualDebtService(1, p.rate, p.amortYears) : null

  return [
    { label: 'DSCR (EBITDA)', value: dscr ? `${dscr.toFixed(2)}x` : '—', test: `≥ ${p.minDscr.toFixed(2)}x @ ${pct(p.rate)} / ${p.amortYears}-yr`, status: dscr ? (dscr >= p.minDscr ? 'pass' : 'fail') : 'na' },
    { label: 'Fixed-charge coverage', value: fcc ? `${fcc.toFixed(2)}x` : '—', test: '(EBITDA − distributions) ÷ debt service', status: fcc ? (fcc >= 1.2 ? 'pass' : 'fail') : 'na' },
    { label: 'Post-close Debt / EBITDA', value: lev ? `${lev.toFixed(2)}x` : '—', test: `≤ ${p.maxLeverage.toFixed(2)}x`, status: lev ? (lev <= p.maxLeverage ? 'pass' : 'fail') : 'na' },
    { label: 'EBITDA margin', value: margin ? pct(margin) : '—', status: 'na' },
    { label: 'Revenue growth (YoY)', value: growth != null ? pct(growth) : '—', status: 'na' },
    { label: 'Annual debt service', value: ds ? money(ds) : '—', status: 'na' },
    { label: 'Max supportable loan', value: maxLoanDscr ? money(maxLoanDscr) : '—', test: 'DSCR constraint', status: maxLoanDscr && loan ? (loan <= maxLoanDscr ? 'pass' : 'fail') : 'na' },
  ]
}

export function underwrite(fields: Record<string, Field>, p: Policy): Metric[] {
  const n = (k: string) => fields[k]?.number ?? null
  const price = n('purchase_price'), loan = n('loan_amount')
  const noi = n('noi_in_place') ?? n('noi_pro_forma')
  const sf = n('building_sf'), egi = n('effective_gross_income'), opex = n('operating_expenses')
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  const money = (v: number) => `$${Math.round(v).toLocaleString()}`

  const ltv = price && loan ? loan / price : null
  const cap = price && noi ? noi / price : null
  const ds = loan ? annualDebtService(loan, p.rate, p.amortYears) : null
  const dscr = ds && noi ? noi / ds : null
  const dy = loan && noi ? noi / loan : null
  const maxLoanLtv = price ? price * p.maxLtv : null
  const maxLoanDscr = noi ? (noi / p.minDscr) / annualDebtService(1, p.rate, p.amortYears) : null
  const maxLoan = maxLoanLtv && maxLoanDscr ? Math.min(maxLoanLtv, maxLoanDscr) : null
  const beo = egi && opex && ds ? (opex + ds) / egi : null

  return [
    { label: 'Loan-to-value', value: ltv ? pct(ltv) : '—', test: `≤ ${pct(p.maxLtv)}`, status: ltv ? (ltv <= p.maxLtv ? 'pass' : 'fail') : 'na' },
    { label: 'DSCR', value: dscr ? `${dscr.toFixed(2)}x` : '—', test: `≥ ${p.minDscr.toFixed(2)}x @ ${pct(p.rate)} / ${p.amortYears}-yr`, status: dscr ? (dscr >= p.minDscr ? 'pass' : 'fail') : 'na' },
    { label: 'Debt yield', value: dy ? pct(dy) : '—', test: `≥ ${pct(p.minDebtYield)}`, status: dy ? (dy >= p.minDebtYield ? 'pass' : 'fail') : 'na' },
    { label: 'Going-in cap rate', value: cap ? pct(cap) : '—', test: 'NOI ÷ price', status: 'na' },
    { label: 'Annual debt service', value: ds ? money(ds) : '—', status: 'na' },
    { label: 'Break-even occupancy', value: beo ? pct(beo) : '—', test: '(opex + debt service) ÷ EGI', status: beo ? (beo <= 0.85 ? 'pass' : 'fail') : 'na' },
    { label: 'Price / SF', value: price && sf ? money(price / sf) : '—', status: 'na' },
    { label: 'Max supportable loan', value: maxLoan ? money(maxLoan) : '—', test: 'lesser of LTV & DSCR constraints', status: maxLoan && loan ? (loan <= maxLoan ? 'pass' : 'fail') : 'na' },
  ]
}
