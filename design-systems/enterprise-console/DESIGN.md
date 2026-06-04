# Enterprise Console

> Category: Enterprise
> A dense, operations-focused console language distilled from SeeLink+ / MasterGo
> component PDFs and international admin screenshots. Use for O&M platforms,
> business monitoring, audit logs, device management, and data-heavy internal tools.

## Visual Theme & Atmosphere
Quiet enterprise control room. The interface should feel precise, reliable, and
ready for repeated daily work. It is not a marketing surface: keep visual energy
inside navigation state, status chips, icons, charts, and primary actions.

The base canvas is cool light gray. Content lives in flat white cards with thin
borders. Navigation is compact, left-anchored, and information-dense. Use
purple-blue as the primary active/action color, cyan/teal for operational
success and metrics, and restrained semantic colors for state.

## Source Evidence
Derived from local templates under `/Users/momocyann/Downloads/模板/`:

- Component specs: Button, Text, Space, Form, Input, Select, Table, Tag, Menu,
  Tabs, Page Header, MessageBox, Alert.
- International screenshots: business platform home, audit-log form page,
  middleware monitoring page, login and modal examples.
- Observed product language: SeeLink+ / MasterGo enterprise dashboard, Element
  Plus-style component taxonomy, dense English admin copy.

## Color Palette & Roles
- **Background:** `#F3F5F8` for app workspace.
- **Surface:** `#FFFFFF` for cards, tables, forms, top bars, and modals.
- **Secondary surface:** `#F8FAFD` for table headers, hover rows, filter bands,
  and inactive tab strips.
- **Foreground:** `#172033` for primary text.
- **Secondary text:** `#39465F` for labels and table content.
- **Muted text:** `#7E8799` for placeholders, captions, timestamps, and metadata.
- **Border:** `#DCE3EF` for inputs and card edges.
- **Soft border:** `#E9EEF6` for table row separators and inner dividers.
- **Accent:** `#6257F2` for selected tabs, primary buttons, active nav, links,
  pagination current page, and chart emphasis.
- **Success:** `#18B785` for normal/success tags and positive operations.
- **Warning:** `#FF9F3D` for awaiting approval, pending, or caution states.
- **Danger:** `#F04444` for abnormal, delete, error, and destructive actions.

Do not use saturated gradients as page backgrounds. Do not make the app dark
unless the user explicitly asks for a dark operations wall.

## Typography Rules
- **Display / headings:** `Inter`, `PingFang SC`, `Microsoft YaHei`, system sans.
- **Body:** same stack. Use regular weight for dense rows and 600 for section
  headings.
- **Mono / numeric:** `ui-monospace`, `SF Mono`, `JetBrains Mono`, monospace.
- Primary UI size is 12px to 14px. Tables and side navigation may use 12px.
- Use 16px to 18px for panel titles; reserve 24px and above for dashboard KPI
  totals or page-level summaries.
- Keep letter spacing at `0`. Use tabular numerals for timestamps, IDs, and
  metrics.

## Layout Principles
- App shell: fixed left sidebar, top tab bar, content workspace.
- Sidebar width: about 212px on desktop. Use icon + label rows, 32px height, and
  8px row radius.
- Workspace padding: 16px around main cards. Use 12px gutters between dense
  panels and 16px gutters between major zones.
- Cards: white, 1px soft border, 6px radius. Avoid decorative shadows except
  dropdowns, popovers, and modals.
- Dashboards: top KPI strip first, then 2-3 card grid, then a full-width table.
- Search/filter pages: filter form at the top of a white card, then table, then
  pagination in the same card.

## Component Stylings
- **Buttons:** 8px radius, 32px default height, 12-16px horizontal padding.
  Primary = accent fill with white text. Secondary = white fill with border.
  Text/link actions are accent text only.
- **Button states:** hover uses `--accent-hover`; active uses
  `--accent-active`; disabled lowers opacity and removes visual emphasis.
- **Inputs/selects:** 32px default height, 1px border, 6px radius, white fill.
  Focus border and ring use accent. Placeholder text is muted.
- **Forms:** labels sit above controls for search/filter rows. Align fields in
  two or three columns. Action buttons stay at row end.
- **Tables:** compact rows, 36px row height, very light header band, soft row
  separators, right-side operation links. Avoid heavy zebra striping.
- **Tags:** small pill chips with tinted background and colored text. Use green
  for Success/Normal, orange for Awaiting approval, red for Abnormal, purple for
  selected or count badges.
- **Navigation:** selected sidebar row uses pale accent fill and dark text.
  Top tabs use pill-like active tabs with a close icon; inactive tabs remain
  text-forward.
- **Dialogs/drawers:** white surface, 6-8px radius, compact title, short body,
  footer actions aligned right.
- **Alerts/messages:** use low-saturation tinted panels. Never block dense work
  views with oversized decorative warning layouts.

## Data Visualization
Use compact charts. Donut charts, line charts, and KPI cards should be legible
inside panels without becoming decorative hero art. Prefer accent, violet,
cyan, green, red, and orange chart series. Include small legends and exact
values when the data is operational.

## International Console Copy
Generated prototypes should be comfortable in English admin copy:

- Use labels like `Business Data Monitoring`, `O&M Monitoring`, `Event center`,
  `Deployment task management`, `Account management`, `Search`, `Reset`,
  `Export`, `In detail`, and `Audits`.
- Timestamps use `YYYY-MM-DD HH:mm:ss` or split date/time in the top bar.
- Long table values may truncate with ellipsis; keep tooltips or detail actions
  available in high-fidelity prototypes.

## Do's and Don'ts
- Do keep information dense, scannable, and aligned.
- Do use the left navigation, top tabs, filter form, table, and pagination as
  the default admin-page skeleton.
- Do keep cards flat and borders subtle.
- Do use accent sparingly but consistently for the active task.
- Do not create marketing-style hero sections for console workflows.
- Do not use large rounded cards, glassmorphism, neumorphism, or decorative
  gradient blobs.
- Do not center all content vertically; operations pages start at the top.
- Do not invent brand colors outside the token palette unless the user provides
  a stronger brand requirement.

## Responsive Behavior
- Desktop is the primary target. Preserve the sidebar and top tabs at wide
  widths.
- Tablet may collapse dense grids to one column while keeping the filter form
  above the table.
- Phone prototypes may hide the sidebar behind a menu button, but do not turn
  data tables into marketing cards unless the user explicitly asks for mobile.

## Agent Prompt Guide
- For any admin console brief, start from an app shell with sidebar, top tabs,
  content card, and dense controls.
- Paste `tokens.css` first, then build components using the fixture selectors.
- Prefer realistic operational data: IDs, timestamps, device counts, audit
  statuses, order numbers, algorithm names, and monitoring metrics.
- Match component density from the source templates: small labels, compact
  table rows, clear status chips, and right-aligned action links.
