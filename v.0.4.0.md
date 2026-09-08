# Release notes — v0.4.0

`ghostfolio-ppi-sync` v0.4.0 focuses on truthful recovery, repeatable bootstrap imports, safe diagnostics, and auditable reporting for one-way PPI-to-Ghostfolio synchronization.

## Highlights

- Reconciles uncertain Ghostfolio import writes before resending activities. A dropped connection, HTTP `408`, or HTTP `5xx` response is checked against target-account fingerprints first, so persisted activities are not sent twice.
- Stops with an explicit unknown-outcome error when reconciliation cannot establish whether a write persisted. The synchronizer never blindly resends that batch.
- Preserves deterministic batch order and resubmits only activities confirmed missing after a partial write.
- Extends the final report with `Unattempted` and `Uncertain` counts, preserves successful earlier-account totals, and returns a nonzero exit for local or Ghostfolio validation failures.
- Separates non-transient Ghostfolio `4xx` validation/request rejections from transport and transient HTTP failures.
- Makes bootstrap holdings target-account-idempotent. Repeated files and interrupted bootstrap imports skip entries already recorded with the deterministic `ppi-bootstrap:` marker.
- Adds a required `BOOTSTRAP_CUTOFF_DATE` policy: bootstrap entries must predate the cutoff, and normal history begins at it to prevent opening positions from overlapping historical PPI movements.
- Applies validated `SYNC_FROM_DATE` and inclusive `SYNC_TO_DATE` ranges to `--ppi-only` and `--ppi-orders`.
- Treats PPI HTTP `429` consistently across authentication and read paths: the command stops immediately, reports incomplete history, and does not probe PPI again automatically.
- Redacts private account and movement fields in diagnostics, documents safe support evidence, and adds `bun run secrets` to scan tracked files for likely credentials while allowing only placeholders and synthetic test fixtures.

## Configuration changes

```dotenv
# Required only when running --bootstrap-holdings.
# Bootstrap activity dates must be strictly earlier than this UTC date.
# Normal PPI history starts at this date when it is configured.
BOOTSTRAP_CUTOFF_DATE=2024-01-02
```

`DRY_RUN=true` and `--dry-run` both validate bootstrap imports without persistence. The command-line flag takes precedence for normal sync configuration.

## Reporting semantics

All values except `Fetched` count activities. `Fetched` counts source movements.

- `Mapped` includes activities later identified as duplicates or failures.
- `Imported` means confirmed accepted by Ghostfolio; during dry-run it means validated, not persisted.
- `Validation failed` covers local validation and non-transient Ghostfolio `4xx` rejections.
- `HTTP failed` covers read, connection, and transient import failures.
- `Unattempted` covers activities after a failed batch.
- `Uncertain` covers activities whose write result could not be reconciled safely.

The categories explain why mapped work was not confirmed imported. Skipped and failed entries use only opaque deterministic fingerprints.

## Safe operation and recovery

Use a dedicated Ghostfolio test account and a narrow time range first:

```bash
bun run sync --ppi-only
bun run sync --ghostfolio-only
bun run sync --dry-run
bun run sync
```

If PPI returns `429`, stop and wait for the provider reset or retry window before starting a new run. If Ghostfolio reports an unknown write outcome, resolve its availability and rerun the same bounded range; target-account fingerprint reconciliation prevents duplicate imports.

For support, share the command, version, UTC range, report counts, opaque fingerprints, HTTP status, and sanitized error type only. Do not share `.env` values, headers, account identifiers, descriptions, or raw provider payloads.

## Verification

v0.4.0 is covered by offline tests only; no PPI rate-limit budget is consumed by the test suite.

```bash
bun run typecheck
bun run lint
bun run secrets
bun test
```

The current suite contains 120 passing tests, including local-service CLI coverage for empty successful runs, invalid date ranges, PPI quota stops, and Ghostfolio validation failures.

## Limitations

- The PPI client remains read-only: it cannot place orders, cancel orders, withdraw funds, or modify accounts.
- Unsupported or ambiguous movements remain skipped unless an explicit, evidence-backed mapping is configured.
- FCI, cauciones, ONs, amortizing bonds, exchanges, splits, and automatic commission association are still outside the supported mapping scope.

> This project is not affiliated with Portfolio Personal Inversiones or Ghostfolio.
