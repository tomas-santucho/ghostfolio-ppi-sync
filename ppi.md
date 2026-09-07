# PPI API operating guide

This synchronizer is read-only. It authenticates with PPI and uses only account movements, historical orders (when explicitly enabled), account balances/positions, and instrument-search endpoints. It has no order-placement, cancellation, transfer, withdrawal, or account-modification calls.

## Safe operating procedure

1. Set `SYNC_FROM_DATE` and, for a bounded run, `SYNC_TO_DATE`.
2. Run `bun run sync --dry-run` first and inspect the final reconciliation report.
3. Run the import only when the dry-run reports the expected mapped, skipped, and failed counts.
4. Do not repeatedly run `--ppi-only` or `--ppi-orders` over an unrestricted history. They are diagnostic reads and can consume PPI quota; use the normal bounded sync for validation.

The client keeps instrument-search results in memory for the duration of a process. It does not cache PPI movement history across runs, so each sync run makes one bounded movement-history request per configured PPI account. Order history is requested only with `PPI_ORDER_ENRICHMENT=true`.

## Response handling

PPI JSON is validated before mapping. Money values are parsed losslessly so that identifiers and amounts are not silently rounded. Unknown response shapes, invalid movements, and ambiguous instruments are not imported.

Read requests use a 15-second timeout. Connection failures, HTTP `408`, and HTTP `5xx` are retried at most twice after the initial request, using bounded exponential delays of 250 ms and 500 ms (up to 2 seconds). A valid `Retry-After` response header overrides that delay.

HTTP `429` is treated explicitly as PPI quota/rate-limit exhaustion and is never retried. The command stops immediately with an incomplete-history error and a nonzero exit code; it does not read Ghostfolio or attempt an import when the initial PPI history request fails. Wait until PPI permits another request, then rerun the same controlled date range. Fingerprint-based duplicate detection recognizes activities that completed before an interruption, so the resumption creates no duplicates.

Other HTTP `4xx` responses are treated as validation/request failures and are not retried. Error text is sanitized before logging; credentials and tokens are redacted.

## Final reconciliation report

Every sync and dry-run prints the same categories:

- `Fetched`: source movements received from PPI.
- `Mapped`: movements with a valid Ghostfolio representation, including duplicates.
- `Imported`: accepted Ghostfolio activities; zero for rejected validation entries.
- `Duplicates`: already-present fingerprinted activities.
- `Unsupported`: deliberately skipped source movements.
- `Validation failed`: source or Ghostfolio validation failures.
- `HTTP failed`: failed reads or import batches.

Skipped and failed entries are reported only through deterministic SHA-256 fingerprints, never by exposing raw PPI movements. Each skipped warning includes a movement type and a concrete reason. A failed Ghostfolio batch reports its activity range and the completed count, so rerunning safely recovers the uncompleted portion.

## Ghostfolio batch size

Set `GHOSTFOLIO_BATCH_SIZE` to a positive integer from `1` to `500` (default: `100`) to control the number of activities sent to Ghostfolio per request. The synchronizer preserves source order. A batch failure reports its number, inclusive activity range, actual size, and completed count; after resolving the error, rerun the same bounded range to resume safely.
