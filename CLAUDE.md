# Werken aan de frontend met Claude

Twee skills staan in `.claude/skills/`:

- **playwright-cli**: laat Claude de app in een echte browser openen, snapshots
  en screenshots maken en klikken. Draai het als `npx playwright-cli` vanuit
  `frontend/` (het staat daar als devDependency); de skill schrijft het zonder
  `npx`.
- **impeccable**: ontwerpcontrole en verfijning (`/impeccable audit`,
  `critique`, `polish`, `typeset`, `layout`, ...). De launcher haalt bij het
  eerste gebruik een eigen binary op.

De ontwerptaal ligt vast in `design/app/ONTWERP.md`, met de schetsen ernaast in
`design/app/`. Impeccable zoekt standaard naar `PRODUCT.md` en `DESIGN.md`:
lees in plaats daarvan `ONTWERP.md`, en die wint. Impeccable verfijnt binnen
die ontwerptaal; het ontwerpt niet opnieuw.
