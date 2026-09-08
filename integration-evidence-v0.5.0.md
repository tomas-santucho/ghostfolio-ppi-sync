# v0.5.0 isolated multi-source evidence

This record contains no credentials, account identifiers, movement descriptions, raw payloads, prices, quantities, or balances. Source accounts are numbered only by their configured order.

## Configuration shape

- Two configured PPI source accounts, imported sequentially into one configured Ghostfolio target account.
- Existing bounded local date range; no range was widened for this run.
- `--dry-run`; Ghostfolio accepted activities were validated only and none were persisted.
- `PPI_CASH_ACTIVITY_IMPORT=false`; no cash activity was written.
- Evaluation revision: v0.5.0 release working tree based on `80a2828`.

## Multi-source dry-run

| Source | Fetched | Mapped | Validated | Duplicates | Unsupported | Validation failed | HTTP failed | Unattempted | Uncertain | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Source account 1 | 159 | 118 | 25 | 89 | 54 | 3 | 0 | 0 | 0 | Completed with known validation failures |
| Source account 2 | 171 | 73 | 73 | 0 | 122 | 0 | 0 | 0 | 0 | Completed cleanly |
| Aggregate | 330 | 191 | 98 | 89 | 176 | 3 | 0 | 0 | 0 | Nonzero because of account-one validation failures |

- The three account-one validation failures are the known unsupported ATVI historical activities. They were retained as validation failures and did not suppress source account 2.
- No PPI HTTP 429, transport failure, uncertain write, or Ghostfolio persistence occurred.
- The sequential run demonstrated two source invocations into one target, with account-one validation failures not suppressing account two. A follow-up isolated read using the supplied secondary identifier returned the same 159-row set as source account 1 rather than the earlier 171-row source-account-two set. The account-number format/selection remains a documented provider limitation. The operator explicitly accepted the multi-source scope on 2026-09-08; R05-03 / #21 may close once its GitHub text replaces obsolete per-account-map wording with the shared-target policy.

## Cash-source availability inventory

The read-only inventory below is evidence of source-shape availability, not cash-reconciliation acceptance. It intentionally omits monetary values and identifiers.

| Source | ARS deposit | ARS withdrawal | MEP deposit | MEP withdrawal | Global-USD funding | CCL funding | Supported interest |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Source account 1 | 5 | 4 | 4 | 0 | 0 | 0 | 0 |
| Source account 2 | 12 | 9 | 1 | 3 | 0 | 0 | 0 |

The range includes BUY, SELL, dividend, tax/fee, ARS funding, and MEP funding examples. It does not contain the global-USD funding, CCL funding, or supported-interest samples required to accept R05-04 / #22. No cash import, second normal import, partial-import recovery, or ATVI corporate-action reconciliation was attempted.
