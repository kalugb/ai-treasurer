export const navGroups = [
  { label: 'Organization', items: [{ id: 'organization', label: 'Organization', icon: 'grid' }] },
  { label: 'Finance', items: [{ id: 'dashboard', label: 'Overview', icon: 'grid' }, { id: 'folders', label: 'Receipts management', icon: 'folder' }, { id: 'teams', label: 'Team Management', icon: 'users' }] },
  { label: 'AI', items: [{ id: 'agent', label: 'AI Agent', icon: 'spark' }, { id: 'insights', label: 'AI Insights', icon: 'insight' }] },
  { label: 'Settings', items: [{ id: 'settings', label: 'Settings', icon: 'sliders' }, { id: 'integration', label: 'Integration', icon: 'plug' }] },
]

export const receipts = [
  ['Mar 18, 2025', 'Adobe Creative Cloud', 'Software', '$54.99', 'Reviewed'],
  ['Mar 16, 2025', 'Loblaws', 'Groceries', '$86.42', 'Needs review'],
  ['Mar 12, 2025', 'Air Canada', 'Travel', '$326.00', 'Reviewed'],
  ['Mar 08, 2025', 'Notion', 'Software', '$16.00', 'Reviewed'],
]

export const initialTeams = [
  {
    id: 'personal',
    name: 'Personal',
    budget: 10000,
    used: 4200,
    members: [{ name: 'Alex Morgan', role: 'Lead' }, { name: 'Jamie Lee', role: 'Member' }],
    receipts: [
      { id: 'adobe', filename: 'adobe-creative-cloud.pdf', merchant: 'Adobe Creative Cloud', date: 'Mar 18, 2025', amount: 54.99, category: 'Software' },
      { id: 'loblaws', filename: 'loblaws-march-16.pdf', merchant: 'Loblaws', date: 'Mar 16, 2025', amount: 86.42, category: 'Groceries' },
      { id: 'air-canada', filename: 'air-canada-flight.pdf', merchant: 'Air Canada', date: 'Mar 12, 2025', amount: 326, category: 'Travel' },
      { id: 'notion', filename: 'notion-march.pdf', merchant: 'Notion', date: 'Mar 08, 2025', amount: 16, category: 'Software' },
    ],
  },
  {
    id: 'northwind',
    name: 'Northwind Co.',
    budget: 18000,
    used: 15120,
    members: [{ name: 'Sam Rivera', role: 'Lead' }, { name: 'Priya Shah', role: 'Co-Lead' }, { name: 'Taylor Kim', role: 'Member' }],
    receipts: [
      { id: 'figma', filename: 'figma-team-plan.pdf', merchant: 'Figma', date: 'Mar 14, 2025', amount: 240, category: 'Software' },
      { id: 'delta', filename: 'delta-client-trip.pdf', merchant: 'Delta Airlines', date: 'Mar 06, 2025', amount: 780, category: 'Travel' },
    ],
  },
  {
    id: 'side-project',
    name: 'Side project',
    budget: 2500,
    used: 130,
    members: [{ name: 'Alex Morgan', role: 'Lead' }],
    receipts: [],
  },
]
