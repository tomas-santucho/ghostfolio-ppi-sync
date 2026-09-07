# Release notes — v0.3.0

`ghostfolio-ppi-sync` v0.3.0 improves reconciliation, recovery, and operational safety for one-way PPI-to-Ghostfolio synchronization.

## Highlights

- Added an actionable reconciliation report for `fetched`, `mapped`, `imported`, `duplicates`, `unsupported`, `validationFailed`, and `httpFailed` records.
- Added deterministic, redaction-safe fingerprints for skipped and failed movements.
- Added concrete movement types and reasons to skip warnings.
- Added bounded retries for connection failures and transient HTTP responses, with `Retry-After` support.
- PPI HTTP `429` responses now stop the run immediately and report that history may be incomplete.
- Added safe recovery after partial Ghostfolio imports without duplicating completed activities.
- Added configurable Ghostfolio import batches through `GHOSTFOLIO_BATCH_SIZE`.
- Added an integration and safe-operation playbook for test-account validation and controlled imports.

## Configuration changes

`GHOSTFOLIO_BATCH_SIZE` is optional and defaults to `100`. It accepts only a positive decimal integer from `1` through `500`. The configured size is applied consistently while preserving source activity order.

`SYNC_TO_DATE` provides an inclusive upper bound for controlled historical validation. Use it together with `SYNC_FROM_DATE` for reproducible runs.

Cash imports remain opt-in through `PPI_CASH_ASSETS`. ARS, global USD, MEP USD, and CCL USD use separate Ghostfolio manual-asset identities. Manual cash and BYMA bond symbols use the `GF_` naming convention and explicit overrides.

## Safe operation

Always validate against a dedicated Ghostfolio test account first:

```bash
bun run sync --ppi-only
bun run sync --ghostfolio-only
bun run sync --ghostfolio-import-dry-run
bun run sync --dry-run
bun run sync
```

Use a narrow controlled date range and review symbols, currencies, `dataSource`, cash assets, warnings, and all report categories before the real import. Rerun the same range to verify that `Imported: 0` and the applicable activities are reported as duplicates.

If PPI returns `429`, stop issuing requests and wait for the quota reset or provider retry window. Rerun the same controlled range with `--dry-run` first. If the initial PPI history read is rate limited, the synchronizer does not access or write Ghostfolio.

For a Ghostfolio batch failure, use the reported batch number, inclusive range, size, and completed count to investigate. After correcting the cause, rerun the same range; fingerprints make the operation idempotent across completed and resumed batches.

See [integration-playbook.md](integration-playbook.md) for the complete procedure and [ppi.md](ppi.md) for PPI request and quota guidance.

## Verification

The release was verified with:

```bash
bun run typecheck
bun run lint
bun test
```

The test suite covers mapping, precision, cash assets, order enrichment, idempotency, retries, `Retry-After`, PPI rate limits, invalid configuration, batch ordering, middle-batch failures, dry-run behavior, and quota-reset resumption. No live PPI request is required by the test suite.

## Security and limitations

- The PPI client remains read-only and has no trading, cancellation, withdrawal, or account-modification operations.
- Never commit `.env`, tokens, private account IDs, or raw PPI/Ghostfolio responses.
- Unsupported or ambiguous instruments remain skipped unless explicit, evidence-backed mappings are configured.
- FCI, cauciones, ONs, amortizing bonds, exchanges, splits, and automatic commission association remain outside the supported mapping scope.

> This project is not affiliated with Portfolio Personal Inversiones or Ghostfolio.
