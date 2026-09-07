# Integration and safe-operation playbook

Use this procedure to validate, import, rerun, and recover a PPI-to-Ghostfolio synchronization. The synchronizer is read-only for PPI, but a normal sync can create activities in Ghostfolio. Perform every first validation and import against a dedicated Ghostfolio test account, never a personal or production account.

## 1. Prepare an isolated test configuration

1. Copy `.env.example` to a local `.env`; do not commit it.
2. Set `GHOSTFOLIO_ACCOUNT_ID` to the dedicated test account ID. Confirm it is not a production account before proceeding.
3. Use a narrow, reproducible range, for example:

   ```dotenv
   SYNC_FROM_DATE=2026-01-01
   SYNC_TO_DATE=2026-01-07
   GHOSTFOLIO_BATCH_SIZE=100
   DRY_RUN=false
   ```

4. Before enabling cash imports, create the required Ghostfolio `MANUAL` assets and review `PPI_CASH_ASSETS`. ARS, global USD, MEP USD, and CCL USD must remain separate asset identities.
5. Review `PPI_SYMBOL_OVERRIDES` for manual assets and BYMA bonds. Confirm each mapped symbol exists in the test account and its intended `dataSource` is correct (`MANUAL` for manual assets; `YAHOO` only for verified Yahoo symbols).

Do not widen the date range merely to eliminate a warning. Unsupported or ambiguous records must be reviewed and either explicitly mapped with evidence or kept skipped.

## 2. Connectivity checks

Run each check at most once while preparing a validation. They are read-only, but PPI diagnostic calls can consume quota.

```bash
# PPI diagnostic: reads PPI movement history only. Do not repeat it over broad history.
bun run sync --ppi-only

# Ghostfolio diagnostic: validates authentication and activity access only.
bun run sync --ghostfolio-only

# Ghostfolio import-contract check: validates a synthetic activity without persistence.
bun run sync --ghostfolio-import-dry-run
```

`--ghostfolio-only` confirms connectivity, not that a requested account ID is correct; verify the configured `GHOSTFOLIO_ACCOUNT_ID` independently before an import. `--ppi-only` is not a replacement for the controlled sync below because it is a diagnostic history read rather than a mapping/reconciliation check.

## 3. Controlled dry-run

Run the exact target range with no persistent Ghostfolio write:

```bash
bun run sync --dry-run
```

Review all final categories before continuing:

- `Fetched`, `Mapped`, `Imported`, and `Duplicates` should align with the expected source range. In a dry-run, `Imported` means accepted by Ghostfolio validation, not persisted.
- `Unsupported` must have a warning with a movement type and concrete reason. Resolve only evidence-backed configuration gaps.
- `Validation failed` and `HTTP failed` must be zero before a real import.
- Review safe fingerprints in skipped/failed output without reconstructing or logging raw movements.

Also inspect the prospective activity types, symbols, currencies, and `dataSource` values. In particular, confirm cash records use the intended pre-created `MANUAL` asset and that no unverified BYMA symbol is being inferred.

## 4. Controlled real import

Keep the same `.env` range, test account, mapping configuration, and batch size used for the successful dry-run. Then run:

```bash
bun run sync
```

The run is acceptable only if `Validation failed` and `HTTP failed` are zero. Review the activity count and sampled activities in the dedicated Ghostfolio test account. Do not promote the configuration to another account until the test account result is correct.

## 5. Duplicate-free second-run verification

Without changing dates, accounts, mappings, or batch size, run the same range again:

```bash
bun run sync --dry-run
```

Expected outcome: `Imported: 0`; `Duplicates` equals the already-imported applicable activities; `Validation failed: 0`; and `HTTP failed: 0`. If this holds, an optional second normal `bun run sync` is safe and must also create no activities. Fingerprints in Ghostfolio comments provide this idempotency across batches and resumptions.

## 6. Recovery

### Ghostfolio batch failure

The error reports the failed batch number, inclusive activity range, actual batch size, and completed count. Do not manually recreate the completed activities. Correct the Ghostfolio availability/configuration problem, keep the same controlled range, then rerun `bun run sync --dry-run` followed by `bun run sync`. Fingerprints cause already-completed batches to be classified as duplicates and only missing activities are imported.

### PPI HTTP 429 / quota exhaustion

PPI `429` means quota or rate-limit exhaustion. The process exits with an incomplete-history error and does not present the sync as complete. If the initial history request fails this way, it performs no Ghostfolio access or writes.

Stop issuing PPI commands, wait for the PPI quota reset or the provider's advertised retry window, and rerun the same `SYNC_FROM_DATE` / `SYNC_TO_DATE` range. Start with `bun run sync --dry-run`; then use the normal import only after its report is clean. Do not broaden the range or repeatedly probe `--ppi-only` while quota is exhausted.

## 7. Data-handling rules

- Never commit `.env`, tokens, API keys, security tokens, private account IDs, raw PPI responses, or raw Ghostfolio responses.
- Do not paste any of those values into issues, pull requests, CI logs, screenshots, test fixtures, or documentation.
- Use anonymized fixtures and placeholder IDs for tests. Keep only safe fingerprints when a movement needs to be referenced.
- Before committing, check `git status` and review the staged diff for accidental secrets or private identifiers.

For endpoint behavior, retry rules, and quota handling, see [ppi.md](ppi.md). For normal configuration and supported mappings, see [README.md](README.md).
