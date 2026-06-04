# Enterprise Console Usage

Agent-facing guide for prototypes generated with the Enterprise Console design
system.

## Read Order

1. Read `DESIGN.md` for the visual intent and page skeletons.
2. Paste `tokens.css` into the first artifact `<style>` block.
3. Use `components.manifest.json` for the compact component inventory.
4. Open `components.html` only when exact component composition is needed.
5. Use preview pages for visual sanity checks.

## Best Fit

- O&M dashboards, audit logs, business monitoring, device operations, account
  management, system settings, algorithm warehouse pages, and data tables.
- International enterprise admin copy in English.
- Dense console UI with left navigation, top tabs, filters, tables, metrics,
  status chips, and operational charts.

## Design Highlights

- Cool light workspace with white cards, pale blue top tabs, and compact left
  navigation.
- Purple-blue active state for primary actions, selected tabs, pagination, and
  links.
- Dense form and table rhythm: 32px controls, 34px headers, 36px rows, and
  subtle row separators.
- Status chips use low-saturation tints so success, pending, and abnormal
  states remain visible without overwhelming the table.

## Build Defaults

- Start with `.app-shell`, `.sidebar`, `.topbar`, and `.workspace`.
- For list pages, use `.filter-grid`, `.data-table`, `.status-tag`, and
  `.pagination`.
- For dashboard pages, use `.kpi-strip`, `.panel-grid`, `.chart-card`, and
  `.data-table`.
- For modal flows, use `.modal`, `.modal-title`, `.modal-body`, and
  `.modal-footer`.

## Do

- Keep the page top-aligned and task-first.
- Use left navigation plus top tabs for multi-module admin workflows.
- Put filters, table, operation links, and pagination in one white work panel.
- Use realistic operational copy, IDs, timestamps, metrics, and status names.

## Avoid

- Marketing hero pages, large decorative cards, glass effects, and full-bleed
  gradients.
- Large typography inside table, form, and navigation surfaces.
- Raw hex values outside the copied `:root` block unless the brief supplies a
  stronger product brand.
