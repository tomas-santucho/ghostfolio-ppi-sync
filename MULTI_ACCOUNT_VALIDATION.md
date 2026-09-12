# Multi-account validation record

Date: 2026-09-12

## Configuration tested

- Two PPI source accounts.
- One active ARS/USD Ghostfolio destination pair for each source. Earlier trial destinations and legacy aggregate accounts are excluded from Ghostfolio analysis, so they cannot inflate the portfolio total.
- `PPI_GHOSTFOLIO_ACCOUNT_TARGETS` defines exactly one ARS/USD pair for every PPI source.
- No legacy or currency-only Ghostfolio target configured.
- `PPI_CASH_ACTIVITY_IMPORT=false`.

## Result

The first full import established source-account × currency routing and idempotency. During the follow-up reconciliation, the broker history exposed two important constraints: order fallback introduced four extra movements for the second source, and some historical sales lacked their opening acquisition in the available PPI activity feed. The v1 configuration therefore keeps order enrichment enabled but disables order fallback; the importer also rejects a SELL that would otherwise produce a negative holding.

With those boundaries applied, the current dry-run prepared 106 supported activities across the two sources. The real run inserted the 20 corrected activities for the second source, and the immediate rerun reported `Imported=0` and `Duplicates=106`, with zero validation failures, HTTP failures, unattempted writes, and uncertain outcomes.

After refreshing Ghostfolio, the active ARS accounts are non-negative. The recent `S13N6` purchase from the second PPI source is present in that source's reconciled ARS destination with the matching quantity. It is no longer combined with the other source account's holding.

## Reconciliation boundary

This record confirms supported-security routing, per-source isolation, non-negative holdings for the represented history, and idempotency. It does not claim full PPI account-value reconciliation: PPI Global holdings and cash flows remain outside the v1 support contract. Cash remains explicitly outside the v1 contract: deposits, withdrawals, settlements, conversions, and PPI cash balances are not represented or reconciled by this validation.

## Current MEP balance projection

The historical activity accounts are retained for audit but excluded from Ghostfolio analysis. PPI's current positions include instruments that have already been closed in the available historical feed, so treating the activity ledger as the live portfolio overstated the dashboard.

For the verified MEP snapshot, the active Ghostfolio accounts are the two `PPI MEP vigente` accounts, one per PPI source. They contain manual MEP balance assets matching the current PPI totals. Their combined Overview total matches the two source totals exactly at the snapshot time. This is an operational current-balance projection, not a claim that the v1 historical importer reconstructs the PPI cash or PPI Global ledger.
