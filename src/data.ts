// Mock data layer — no backend. Shapes mirror the PRD core data model (§28).

export type Stage =
  | 'Application' | 'Underwriting' | 'Approval' | 'Closing' | 'Servicing'

export type LoanSummary = {
  id: string
  borrower: string
  type: string
  amount: number
  stage: Stage
  rm: string
  riskRating: number
  nextAction: string
  probability?: number
  rate: string
  term: string
  ltv: number | null
  dscr: number | null
  maturity: string
  collateral: string
}

export type Doc = {
  name: string
  classification: string
  period: string
  status: 'Verified' | 'Needs Review' | 'Missing' | 'Incomplete'
  confidence: number | null
  pages: string
  flags: string[]
}

export type SpreadRow = { label: string; values: (number | null)[]; bold?: boolean }

export type Covenant = {
  name: string
  requirement: string
  actual: string
  status: 'Pass' | 'Fail' | 'Near'
  tested: string
  source: string
}

export type Tickler = {
  requirement: string
  party: string
  frequency: string
  due: string
  status: 'Complete' | 'Requested' | 'Past Due' | 'Upcoming'
  source: string
}

export type ApprovalStep = {
  step: string
  actor: string
  date: string
  outcome: string
  notes?: string
}

export type ClosingItem = {
  category: string
  item: string
  responsible: string
  status: 'Satisfied' | 'Received' | 'Ordered' | 'Outstanding' | 'Waived'
  evidence?: string
}

export const loans: LoanSummary[] = [
  { id: 'CL-2026-041', borrower: 'Harbor Point Logistics LLC', type: 'Owner-Occupied CRE', amount: 4_250_000, stage: 'Servicing', rm: 'D. Alvarez', riskRating: 4, nextAction: 'Q2 covenant test ready for review', rate: 'SOFR + 275', term: '10 / 25', ltv: 68, dscr: 1.74, maturity: 'Mar 15, 2036', collateral: '1st DOT — warehouse' },
  { id: 'CL-2026-057', borrower: 'Bluestem Ag Partners', type: 'Agricultural RE', amount: 2_800_000, stage: 'Closing', rm: 'K. Ostrander', riskRating: 4, nextAction: 'Title commitment under AI review — 2 exceptions', rate: '6.85% fixed', term: '5 / 20', ltv: 62, dscr: 1.41, maturity: 'Aug 1, 2031', collateral: '1st DOT — 640 ac farmland' },
  { id: 'CL-2026-063', borrower: 'Meridian Group PC', type: 'Business Acquisition', amount: 1_450_000, stage: 'Approval', rm: 'D. Alvarez', riskRating: 5, nextAction: 'Senior loan committee — Thursday packet drafted', probability: 0.8, rate: 'Prime + 100', term: '7 / 10', ltv: 82, dscr: 1.32, maturity: 'Sep 30, 2033', collateral: 'Blanket UCC + practice assets' },
  { id: 'CL-2026-066', borrower: 'Cascade Fabrication Inc', type: 'Equipment', amount: 900_000, stage: 'Underwriting', rm: 'J. Whitfield', riskRating: 4, nextAction: 'Spreads complete; global DSCR drafted for analyst', probability: 0.7, rate: '7.10% fixed', term: '5 / 5', ltv: 80, dscr: 1.55, maturity: 'Oct 15, 2031', collateral: 'CNC equipment — PMSI' },
  { id: 'CL-2026-071', borrower: 'Sable Ridge Storage LLC', type: 'Investor CRE', amount: 6_750_000, stage: 'Underwriting', rm: 'K. Ostrander', riskRating: 5, nextAction: 'Rent roll inconsistency flagged vs. Schedule E', probability: 0.6, rate: 'SOFR + 300', term: '10 / 25', ltv: 71, dscr: 1.28, maturity: 'Nov 1, 2036', collateral: '1st DOT — self-storage' },
  { id: 'CL-2026-074', borrower: 'North Fork Brewing Co', type: 'Working Capital LOC', amount: 500_000, stage: 'Application', rm: 'J. Whitfield', riskRating: 0, nextAction: '3 of 11 checklist documents received', probability: 0.5, rate: 'Prime + 75', term: '1 / —', ltv: null, dscr: null, maturity: 'Aug 31, 2027', collateral: 'A/R + inventory' },
  { id: 'CL-2026-075', borrower: 'Ellison Medical Properties', type: 'Construction', amount: 9_200_000, stage: 'Application', rm: 'D. Alvarez', riskRating: 0, nextAction: 'Ownership chart incomplete — 87% accounted for', probability: 0.55, rate: 'SOFR + 325', term: '2 / IO', ltv: 65, dscr: null, maturity: 'Sep 1, 2028', collateral: '1st DOT — medical office (TBB)' },
]

// Portfolio-wide covenant view (one row per loan × covenant)
export const portfolioCovenants = [
  { loan: 'CL-2026-041', borrower: 'Harbor Point Logistics LLC', covenant: 'Minimum DSCR', threshold: '≥ 1.25x', actual: '1.74x', status: 'Pass', nextTest: 'FYE 2025 stmts', source: 'LA §6.12(a)' },
  { loan: 'CL-2026-041', borrower: 'Harbor Point Logistics LLC', covenant: 'Fixed-charge coverage', threshold: '≥ 1.20x', actual: '1.18x', status: 'Near', nextTest: 'Q2 2026', source: 'LA §6.12(b)' },
  { loan: 'CL-2026-041', borrower: 'Harbor Point Logistics LLC', covenant: 'Max Debt / TNW', threshold: '≤ 3.5x', actual: '2.4x', status: 'Pass', nextTest: 'Q2 2026', source: 'LA §6.12(c)' },
  { loan: 'CL-2026-057', borrower: 'Bluestem Ag Partners', covenant: 'Minimum DSCR', threshold: '≥ 1.25x', actual: '1.41x', status: 'Pass', nextTest: 'FYE 2026', source: 'LA §6.10(a)' },
  { loan: 'CL-2026-057', borrower: 'Bluestem Ag Partners', covenant: 'Minimum working capital', threshold: '≥ $400K', actual: '$355K', status: 'Fail', nextTest: 'Waiver in review', source: 'LA §6.10(b)' },
  { loan: 'CL-2026-063', borrower: 'Meridian Group PC', covenant: 'Minimum DSCR', threshold: '≥ 1.20x', actual: '1.32x (pro forma)', status: 'Pass', nextTest: 'Proposed', source: 'Term sheet' },
  { loan: 'CL-2026-071', borrower: 'Sable Ridge Storage LLC', covenant: 'Minimum debt yield', threshold: '≥ 9.0%', actual: '8.7% (pro forma)', status: 'Near', nextTest: 'Proposed', source: 'Term sheet' },
]

export const dashboardAlerts = [
  { severity: 'high', text: 'Sable Ridge Storage — rent roll total ($68,400/mo) does not tie to Schedule E rental income; routed to analyst.', loan: 'CL-2026-071' },
  { severity: 'high', text: 'Harbor Point Logistics — fixed-charge coverage 1.18x vs. 1.20x required. Near-violation flagged for Q2 test.', loan: 'CL-2026-041' },
  { severity: 'med', text: 'Bluestem Ag — insurance certificate missing lender loss-payable clause. Draft borrower request pending approval.', loan: 'CL-2026-057' },
  { severity: 'med', text: 'Ellison Medical — beneficial ownership totals 87%. Follow-up request drafted for RM review.', loan: 'CL-2026-075' },
  { severity: 'low', text: 'Meridian Group — committee packet auto-assembled; 2 policy exceptions itemized (LTV, amortization).', loan: 'CL-2026-063' },
]

export const dueTicklers = [
  { loan: 'CL-2026-041', borrower: 'Harbor Point Logistics', item: '2025 CPA-reviewed financials', party: 'Borrower', due: 'Apr 30, 2026', status: 'Past Due', source: 'LA §6.01(a)' },
  { loan: 'CL-2026-066', borrower: 'Cascade Fabrication', item: 'Q2 borrowing-base certificate', party: 'Borrower', due: 'Jul 20, 2026', status: 'Past Due', source: 'LA §6.02' },
  { loan: 'CL-2026-041', borrower: 'Harbor Point Logistics', item: 'Property insurance renewal', party: 'Agent', due: 'Aug 9, 2026', status: 'Requested', source: 'LA §5.04' },
  { loan: 'CL-2026-071', borrower: 'Sable Ridge Storage', item: 'Jun rent roll', party: 'Borrower', due: 'Jul 25, 2026', status: 'Requested', source: 'Checklist' },
  { loan: 'CL-2026-041', borrower: 'Harbor Point Logistics', item: 'Q2 interim financials', party: 'Borrower', due: 'Aug 14, 2026', status: 'Upcoming', source: 'LA §6.01(b)' },
  { loan: 'CL-2026-057', borrower: 'Bluestem Ag Partners', item: 'UCC continuation', party: 'Loan ops', due: 'Sep 14, 2026', status: 'Upcoming', source: 'SA §3.3' },
  { loan: 'CL-2026-041', borrower: 'Harbor Point Logistics', item: 'Annual review', party: 'Portfolio mgr', due: 'Sep 30, 2026', status: 'Upcoming', source: 'Policy' },
  { loan: 'CL-2026-041', borrower: 'Harbor Point Logistics', item: 'Guarantor PFS (Ito, Raman)', party: 'Guarantors', due: 'Jan 31, 2026', status: 'Complete', source: 'Guaranty §4.1' },
]

// ——— Detailed record for the flagship demo loan ———

export const detail = {
  id: 'CL-2026-041',
  borrower: 'Harbor Point Logistics LLC',
  entity: 'Delaware LLC · EIN 84-3172206 · Formed 2014',
  naics: '493110 — General Warehousing and Storage',
  guarantors: [
    { name: 'Marcus Ito', ownership: '55%', guarantee: 'Unlimited', netWorth: 4_800_000, liquidity: 610_000 },
    { name: 'Priya Raman', ownership: '45%', guarantee: 'Unlimited', netWorth: 3_200_000, liquidity: 480_000 },
  ],
  terms: [
    ['Commitment', '$4,250,000'],
    ['Product', 'Owner-occupied CRE term loan'],
    ['Rate', 'SOFR + 275 bps, 6.50% floor'],
    ['Term / Amortization', '10 yr / 25 yr'],
    ['Maturity', 'Mar 15, 2036'],
    ['Collateral', '1st DOT — 84,000 SF warehouse, 2200 Harbor Point Rd'],
    ['LTV', '68% ($6.25MM as-is appraisal, eff. Jan 2026)'],
    ['Risk rating', '4 (Pass)'],
    ['Officer', 'D. Alvarez · Branch 04'],
  ] as [string, string][],
  docs: [
    { name: 'HPL_1065_2024.pdf', classification: '1065 Partnership Return', period: 'FY 2024', status: 'Verified', confidence: 0.98, pages: '1–42', flags: [] },
    { name: 'HPL_1065_2023.pdf', classification: '1065 Partnership Return', period: 'FY 2023', status: 'Verified', confidence: 0.97, pages: '1–39', flags: [] },
    { name: 'HPL_interim_Q1_2026.xlsx', classification: 'Interim Financial Statement', period: 'Q1 2026', status: 'Verified', confidence: 0.95, pages: '—', flags: ['Internally prepared, accrual basis'] },
    { name: 'HPL_FY2025_reviewed.pdf', classification: 'CPA-Reviewed Financials', period: 'FY 2025', status: 'Missing', confidence: null, pages: '—', flags: ['Required within 120 days of FYE — past due 82 days'] },
    { name: 'Ito_PFS_2026.pdf', classification: 'Personal Financial Statement', period: 'Jan 2026', status: 'Verified', confidence: 0.96, pages: '1–4', flags: [] },
    { name: 'Raman_PFS_2026.pdf', classification: 'Personal Financial Statement', period: 'Feb 2026', status: 'Needs Review', confidence: 0.81, pages: '1–4', flags: ['Contingent liabilities table low confidence — routed for review'] },
    { name: 'ACORD25_2025.pdf', classification: 'Insurance Certificate', period: 'exp. Aug 2026', status: 'Verified', confidence: 0.99, pages: '1', flags: ['Renewal tickler set — Aug 09'] },
    { name: 'HPL_appraisal_2026.pdf', classification: 'Appraisal (Income + Sales)', period: 'Eff. Jan 2026', status: 'Verified', confidence: 0.94, pages: '1–118', flags: ['Cap rate 7.25% · NOI $498K · reviewed & approved Feb 12'] },
  ] as Doc[],
  spreadYears: ['FY 2023', 'FY 2024', 'Q1 2026 ann.'],
  spread: [
    { label: 'Revenue', values: [6_140_000, 6_910_000, 7_260_000] },
    { label: 'Cost of goods sold', values: [3_560_000, 3_980_000, 4_140_000] },
    { label: 'Gross profit', values: [2_580_000, 2_930_000, 3_120_000], bold: true },
    { label: 'Operating expenses', values: [1_690_000, 1_860_000, 2_010_000] },
    { label: 'EBITDA', values: [890_000, 1_070_000, 1_110_000], bold: true },
    { label: 'Depreciation & amortization', values: [310_000, 335_000, 340_000] },
    { label: 'Interest expense', values: [214_000, 262_000, 268_000] },
    { label: 'Net income', values: [366_000, 473_000, 502_000], bold: true },
    { label: 'Distributions', values: [180_000, 240_000, 250_000] },
    { label: 'Total debt', values: [3_980_000, 4_310_000, 4_270_000] },
    { label: 'Tangible net worth', values: [1_420_000, 1_650_000, 1_780_000] },
  ] as SpreadRow[],
  ratios: [
    { name: 'DSCR (business)', values: ['1.61x', '1.74x', '1.76x'], target: '≥ 1.25x' },
    { name: 'Global DSCR', values: ['1.38x', '1.47x', '1.49x'], target: '≥ 1.20x' },
    { name: 'Fixed-charge coverage', values: ['1.22x', '1.24x', '1.18x'], target: '≥ 1.20x' },
    { name: 'Debt / EBITDA', values: ['4.5x', '4.0x', '3.8x'], target: '≤ 5.0x' },
    { name: 'Debt / TNW', values: ['2.8x', '2.6x', '2.4x'], target: '≤ 3.5x' },
    { name: 'Current ratio', values: ['1.4', '1.5', '1.5'], target: '≥ 1.2' },
  ],
  covenants: [
    { name: 'Minimum DSCR', requirement: '≥ 1.25x, tested annually on FYE statements', actual: '1.74x (FY 2024)', status: 'Pass', tested: 'Awaiting FY 2025 reviewed statements', source: 'Loan Agreement §6.12(a), p. 41' },
    { name: 'Fixed-charge coverage', requirement: '≥ 1.20x, tested quarterly', actual: '1.18x (Q1 2026)', status: 'Near', tested: 'Q2 test pending Jun interims', source: 'Loan Agreement §6.12(b), p. 41' },
    { name: 'Maximum Debt/TNW', requirement: '≤ 3.5x', actual: '2.4x', status: 'Pass', tested: 'Q1 2026', source: 'Loan Agreement §6.12(c), p. 42' },
    { name: 'Minimum guarantor liquidity', requirement: '≥ $750K combined', actual: '$1,090K', status: 'Pass', tested: 'Feb 2026 PFS', source: 'Guaranty §4.2, p. 6' },
    { name: 'Distribution limit', requirement: '≤ 50% of net income unless DSCR ≥ 1.50x', actual: '50% of NI; DSCR 1.74x', status: 'Pass', tested: 'FY 2024', source: 'Loan Agreement §7.06, p. 48' },
  ] as Covenant[],
  ticklers: [
    { requirement: 'CPA-reviewed annual financial statements', party: 'Borrower', frequency: 'Annual · 120 days after FYE', due: 'Apr 30, 2026', status: 'Past Due', source: 'Loan Agreement §6.01(a), p. 37' },
    { requirement: 'Interim financial statements', party: 'Borrower', frequency: 'Quarterly · 45 days after quarter-end', due: 'Aug 14, 2026', status: 'Upcoming', source: 'Loan Agreement §6.01(b), p. 37' },
    { requirement: 'Personal financial statements', party: 'Guarantors', frequency: 'Annual', due: 'Jan 31, 2027', status: 'Complete', source: 'Guaranty §4.1, p. 6' },
    { requirement: 'Business & personal tax returns', party: 'Borrower / Guarantors', frequency: 'Annual · 30 days after filing', due: 'Received May 2026', status: 'Complete', source: 'Loan Agreement §6.01(c), p. 38' },
    { requirement: 'Property insurance renewal evidence', party: 'Borrower / Agent', frequency: 'Annual', due: 'Aug 09, 2026', status: 'Requested', source: 'Loan Agreement §5.04, p. 29' },
    { requirement: 'Annual review', party: 'Portfolio manager', frequency: 'Annual', due: 'Sep 30, 2026', status: 'Upcoming', source: 'Bank policy · relationship > $2.5MM' },
    { requirement: 'UCC continuation', party: 'Loan operations', frequency: 'Every 5 years', due: 'Nov 2029', status: 'Upcoming', source: 'Security Agreement §3.3, p. 9' },
  ] as Tickler[],
  approvals: [
    { step: 'Analyst recommendation', actor: 'T. Nguyen, Credit Analyst', date: 'Feb 18, 2026', outcome: 'Recommended', notes: 'Risk rating 4. Two policy exceptions: none. AI-drafted memo reviewed, 3 edits.' },
    { step: 'Credit officer', actor: 'S. Barrett, SVP Credit', date: 'Feb 21, 2026', outcome: 'Approved w/ conditions', notes: 'Conditions: FCC covenant added at 1.20x quarterly; interest reserve not required.' },
    { step: 'Senior loan committee', actor: '5 voting members', date: 'Feb 26, 2026', outcome: 'Approved 5–0', notes: 'Approval expires Aug 26, 2026. Conditions auto-converted to closing checklist.' },
    { step: 'Document reconciliation', actor: 'CovenantAI + M. Chen, Doc Specialist', date: 'Mar 12, 2026', outcome: 'Matches approval', notes: '22 of 22 terms reconciled. 1 minor discrepancy (late-charge grace 10 vs 15 days) resolved before signing.' },
    { step: 'Funding authorization', actor: 'Dual control — Ops + Credit', date: 'Mar 15, 2026', outcome: 'Funded', notes: 'Boarded to core same day; 41 of 43 fields auto-mapped, 2 reviewed manually.' },
  ] as ApprovalStep[],
  closing: [
    { category: 'Organizational', item: 'Certificate of good standing (DE)', responsible: 'Borrower counsel', status: 'Satisfied', evidence: 'gs_de_2026.pdf' },
    { category: 'Organizational', item: 'Borrowing resolution', responsible: 'Borrower', status: 'Satisfied', evidence: 'resolution_signed.pdf' },
    { category: 'Compliance', item: 'Beneficial ownership certification', responsible: 'RM', status: 'Satisfied', evidence: 'boc_2026.pdf' },
    { category: 'Compliance', item: 'OFAC / sanctions screening', responsible: 'BSA', status: 'Satisfied', evidence: 'Cleared Feb 20' },
    { category: 'Collateral', item: 'As-is appraisal ≥ $6.0MM', responsible: 'Appraisal desk', status: 'Satisfied', evidence: '$6.25MM, reviewed Feb 12' },
    { category: 'Collateral', item: 'Phase I ESA — no RECs', responsible: 'Env. consultant', status: 'Satisfied', evidence: 'phase1_hpl.pdf' },
    { category: 'Title', item: 'Title policy with survey endorsement', responsible: 'Title co.', status: 'Satisfied', evidence: 'Final policy Apr 02' },
    { category: 'Insurance', item: 'Property + GL with lender loss payee', responsible: 'Agent', status: 'Satisfied', evidence: 'ACORD25_2025.pdf' },
    { category: 'Flood', item: 'Flood determination — Zone X', responsible: 'Vendor', status: 'Satisfied', evidence: 'Life-of-loan cert' },
    { category: 'Post-closing', item: 'Recorded deed of trust follow-up', responsible: 'Loan ops', status: 'Received', evidence: 'Recorded Mar 28' },
  ] as ClosingItem[],
}

export const fmtMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}MM` : `$${(n / 1_000).toFixed(0)}K`

export const fmtFull = (n: number) => `$${n.toLocaleString('en-US')}`
