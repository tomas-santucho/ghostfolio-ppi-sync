# Multi-account validation record

Date: 2026-09-12

## Configuration tested

- Two PPI source accounts.
- Four new Ghostfolio destinations: one ARS and one USD account for each source.
- `PPI_GHOSTFOLIO_ACCOUNT_TARGETS` defines exactly one ARS/USD pair for every PPI source.
- No legacy or currency-only Ghostfolio target configured.
- `PPI_CASH_ACTIVITY_IMPORT=false`.

## Result

The full configured history completed successfully in dry-run and in a real import. The dry-run prepared 116 supported activities. The real import wrote those 116 activities, and its immediate rerun wrote zero activities and reported all 116 as duplicates. Every run had zero Ghostfolio validation failures, HTTP failures, unattempted writes, and uncertain outcomes.

After refreshing Ghostfolio, the four destinations showed 15, 72, 28, and 1 activities respectively, for a total of 116. This verifies that each source history is contained by its own source-account × currency targets.

The recent `S13N6` purchase from the second PPI source is present in that source's ARS destination with the matching quantity. It is no longer combined with the other source account's holding.

## Reconciliation boundary

This record confirms supported-security routing, per-source isolation, and idempotency. Cash remains explicitly outside the v1 contract: deposits, withdrawals, settlements, conversions, and PPI cash balances are not represented or reconciled by this validation.
