// Tiny inline icon set for column headers / toolbar (16px, currentColor).
const P = ({ d, ...r }: { d: string } & React.SVGProps<SVGSVGElement>) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" {...r}><path d={d} /></svg>
)

export const Ico = {
  hash: () => <P d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />,
  text: () => <P d="M4 6h16M4 12h10M4 18h16" />,
  tag: () => <P d="M20 12l-8 8-9-9V4h7l10 8zM7.5 7.5h.01" />,
  building: () => <P d="M3 21h18M5 21V5a1 1 0 011-1h12a1 1 0 011 1v16M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2" />,
  person: () => <P d="M20 21a8 8 0 10-16 0M12 13a4 4 0 100-8 4 4 0 000 8z" />,
  cal: () => <P d="M4 5h16v16H4zM4 10h16M8 3v4M16 3v4" />,
  status: () => <P d="M12 22a10 10 0 100-20 10 10 0 000 20zM12 8v4l3 2" />,
  percent: () => <P d="M19 5L5 19M6.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM17.5 20a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />,
  dollar: () => <P d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5s2 3 5 3.5 5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.4-5-3.5" />,
  shield: () => <P d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />,
  doc: () => <P d="M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6" />,
  lock: () => <P d="M6 11h12v10H6zM9 11V7a3 3 0 016 0v4" />,
  sort: () => <P d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />,
  filter: () => <P d="M4 6h16M7 12h10M10 18h4" />,
  group: () => <P d="M4 6h16M4 12h16M4 18h16M4 4v4M4 10v4M4 16v4" />,
  search: () => <P d="M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4" />,
  sliders: () => <P d="M4 8h10M18 8h2M4 16h4M12 16h8M14 5v6M8 13v6" />,
  plus: () => <P d="M12 5v14M5 12h14" />,
  link: () => <P d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
  star: () => <P d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3z" />,
  dots: () => <P d="M12 6h.01M12 12h.01M12 18h.01" />,
  chevron: () => <P d="M9 6l6 6-6 6" />,
  chat: () => <P d="M21 12a8 8 0 01-8 8H4l-1 2v-10a9 9 0 019-9h1a8 8 0 018 9zM8 12h.01M12 12h.01M16 12h.01" />,
  logo: () => <P d="M4 12h6l2-4 4 8 2-4h2" strokeWidth="2.4" />,
  check: () => <P d="M5 12l5 5L20 7" strokeWidth="2.6" />,
  x: () => <P d="M6 6l12 12M18 6L6 18" strokeWidth="2.6" />,
  clock: () => <P d="M12 22a10 10 0 100-20 10 10 0 000 20zM12 7v5l3 2" strokeWidth="2.4" />,
}
