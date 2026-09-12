# Multi-account validation record

Date: 2026-09-12

## Configuration tested

- Two PPI source accounts.
- Two new Ghostfolio destinations: one for normalized ARS activities and one for normalized USD activities.
- No legacy Ghostfolio target configured.
- `PPI_CASH_ACTIVITY_IMPORT=false`.

## Result

The full configured history completed successfully in dry-run and in a real import. The real import wrote 116 supported activities; its immediate rerun wrote zero activities and reported all 116 as duplicates. Both runs had zero Ghostfolio validation failures, HTTP failures, unattempted writes, and uncertain outcomes.

The Ghostfolio destinations visibly contain 43 ARS-target activities and 73 USD-target activities, matching the 116 imported activities.

## Reconciliation boundary

The split-target mode aggregates every configured PPI source by normalized currency. It is therefore not a per-source-account representation. A visual check of one PPI source account found its recent `S13N6` purchase present in Ghostfolio, but the ARS target shows twice that source-account quantity because it contains movements from both configured sources.

This confirms import routing and idempotency, but it does **not** demonstrate per-source holding reconciliation. Cash remains explicitly outside the v1 contract. To reconcile each PPI source separately, configure distinct Ghostfolio targets per source (and, if required, per currency) rather than the current two currency-only targets.
