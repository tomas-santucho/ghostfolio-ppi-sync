# ghostfolio-ppi-sync

`ghostfolio-ppi-sync` is a one-way, read-only synchronizer from Portfolio Personal Inversiones (PPI) to Ghostfolio.

```
PPI API
  |
  v
ghostfolio-ppi-sync
  |
  v
Ghostfolio API
```

This project is not affiliated with Portfolio Personal Inversiones or Ghostfolio.

## What it does

- Reads PPI movements and historical transactions.
- Maps supported movements to Ghostfolio activities.
- Avoids duplicates using a deterministic fingerprint stored in the Ghostfolio activity comment.
- Supports dry-run validation before any Ghostfolio write.
- Never sends trading orders, cancels orders, withdraws funds, or changes PPI accounts.

## Supported scope

The v1.0.0 release contract supports unambiguous BUY, SELL, DIVIDEND, INTEREST, and FEE mappings. ARS and USD PPI currency labels are normalized to ISO currency codes. Cash balances, deposits, withdrawals, and trade-settlement cash legs are outside that contract: they remain disabled by default and experimental if manually enabled.

PPI and Ghostfolio data is validated with Zod. Amounts, quantities, prices, and fees remain decimal strings inside the domain model and are converted only at the Ghostfolio HTTP boundary.

Unsupported or ambiguous movements are logged as warnings and skipped.

Read-only PPI requests use timeouts and bounded retries for connection failures, transient `408`, and `5xx` responses. A PPI `429` rate limit is never retried: it stops the run immediately, marks history as incomplete, and returns a nonzero exit code. See [the PPI operating guide](ppi.md) and the [integration and safe-operation playbook](integration-playbook.md) before running diagnostics or an import.

## Requirements

- Bun 1.x
- A PPI API account with read access
- A Ghostfolio instance and target account

## Install

```bash
bun install
cp .env.example .env
```

Fill `.env` locally. Never commit it.

## Configuration

Required variables:

```dotenv
PPI_API_URL=https://clientapi.portfoliopersonal.com
PPI_AUTHORIZED_CLIENT=...
PPI_CLIENT_KEY=...
PPI_PUBLIC_KEY=...
PPI_PRIVATE_KEY=...
PPI_ACCOUNT_ID=...
# Optional: fetch PPI historical orders for exact, read-only fingerprint enrichment.
PPI_ORDER_ENRICHMENT=false

GHOSTFOLIO_URL=https://ghostfolio.example
GHOSTFOLIO_SECURITY_TOKEN=...
GHOSTFOLIO_ACCOUNT_ID=...
# Optional: positive integer from 1 to 500; defaults to 100.
GHOSTFOLIO_BATCH_SIZE=100

SYNC_FROM_DATE=2024-01-01
DRY_RUN=false
LOG_LEVEL=info
```

`GHOSTFOLIO_ACCESS_TOKEN` can be used instead of `GHOSTFOLIO_SECURITY_TOKEN`. The latter is exchanged for an ephemeral Ghostfolio Bearer token at runtime.

Optional variables include `PPI_ACCOUNT_IDS`, `PPI_ORDER_ENRICHMENT`, `PPI_ORDER_FALLBACK`, `PPI_SYMBOL_OVERRIDES`, `PPI_CASH_ASSETS`, `PPI_CASH_ACTIVITY_IMPORT`, `BOOTSTRAP_HOLDINGS_FILE`, `BOOTSTRAP_CUTOFF_DATE`, and `SYNC_LOCK_PATH`.

Use `SYNC_FROM_DATE` and optional inclusive `SYNC_TO_DATE` to restrict a historical sync to a controlled date range.

### Configuration precedence

Bun loads a local `.env` for development, but an explicitly exported process environment variable takes precedence. Docker Compose reads the same `.env`; its service-level `environment` block overrides it, including the shared `SYNC_LOCK_PATH` in `docker-compose.example.yml`. Keep credentials only in `.env` or the deployment secret store, never in Compose YAML or tracked files.

### Identity and scoped overrides

New activities use the versioned comment identity `ppi-sync:ppi:v2:<source-account>:<hash>`. Its canonical fields are the source account, PPI external ID when present, normalized activity type and UTC date, original source symbol, quantity, unit price, fee, ISO currency, and source balance. The mapped Ghostfolio symbol, provider, market, and ISIN are deliberately excluded so an override change does not reimport historical source activity.

The synchronizer recognizes legacy unversioned comments from before and after the v0.3 balance discriminator. It also recognizes compatible identities that lack an order ID or balance. A legacy candidate must match exactly one existing activity in the configured target account; an ambiguous legacy match is reported as a validation failure instead of suppressing a potentially unrelated movement. Existing activities are never deleted or rewritten during an upgrade. Rerun the same bounded range in dry-run after upgrading, investigate any ambiguity, and then import only after the report is clean.

`PPI_SYMBOL_OVERRIDES` accepts global rules and optional `accountId`, `currency`, `market`, and `isin` scopes. The most specific matching rule wins; equally specific, overlapping rules are rejected at configuration load. `dataSource` accepts only `YAHOO` or `MANUAL`; a `MANUAL` override must point to a user-created Ghostfolio asset identifier (a UUID or `GF_` symbol).

```json
[
  {"symbol":"AAPL","mappedSymbol":"AAPL","dataSource":"YAHOO"},
  {"symbol":"AL30","mappedSymbol":"GF_PPI_AL30","accountId":"source-account","currency":"ARS","market":"BYMA","isin":"ARARGE3209S6","dataSource":"MANUAL"}
]
```

## BYMA bonds and manual assets

BYMA bonds are never guessed as Yahoo symbols. Create Ghostfolio MANUAL assets first, then map PPI tickers explicitly with `PPI_SYMBOL_OVERRIDES`.

```json
[
  {
    "symbol": "AL30",
    "mappedSymbol": "GF_PPI_AL30",
    "isin": "ARARGE3209S6",
    "market": "BYMA",
    "dataSource": "MANUAL"
  },
  {
    "symbol": "AL30C",
    "mappedSymbol": "GF_PPI_AL30C",
    "isin": "ARARGE3209S6",
    "market": "BYMA",
    "dataSource": "MANUAL"
  },
  {
    "symbol": "AL30D",
    "mappedSymbol": "GF_PPI_AL30D",
    "isin": "ARARGE3209S6",
    "market": "BYMA",
    "dataSource": "MANUAL"
  }
]
```

`symbol` is the PPI ticker and `mappedSymbol` is the Ghostfolio asset. AL30, AL30C, and AL30D remain separate because their trading currencies differ.

## Experimental PPI cash mapping (post-v1)

This configuration is retained for controlled research only; it is **not a supported v1 capability**. Keep `PPI_CASH_ACTIVITY_IMPORT=false` for v1. Enabling it manually does not promise PPI cash-balance reconciliation, nor support deposits, withdrawals, or settlement legs as part of the stable release contract.

PPI has distinct USD custody/settlement buckets; Ghostfolio still uses ISO `USD`, so the asset identity — rather than the currency code — keeps them separate.

### Create the Ghostfolio cash profiles

In the target Ghostfolio account, select **Add asset profile** → **Add manually**. For every profile, select the stated currency and choose **Cash** if an asset-class field is shown. Do not create an opening BUY activity. When Ghostfolio presents the `GF_` symbol prefix, enter the suffix shown below; the resulting full symbol must match the configuration exactly.

| Display name | Enter after `GF_` | Full symbol | Currency | PPI bucket |
| --- | --- | --- | --- | --- |
| PPI Cash ARS | `PPI_CASH_ARS` | `GF_PPI_CASH_ARS` | ARS | ARS |
| PPI Cash USD Global | `PPI_CASH_USD_GLOBAL` | `GF_PPI_CASH_USD_GLOBAL` | USD | global USD / `Dolar Saxo` |
| PPI Cash USD MEP | `PPI_CASH_USD_MEP` | `GF_PPI_CASH_USD_MEP` | USD | MEP / billete |
| PPI Cash USD CCL | `PPI_CASH_USD_CCL` | `GF_PPI_CASH_USD_CCL` | USD | CCL / cable / divisa |

Keep all four assets separate. A Ghostfolio dry-run validated these four `GF_` MANUAL profiles against the configured test account without persistence.

For the sanitized live-evidence record and the remaining reconciliation work, read `integration-evidence-v0.5.0.md` and `v0.5.0_final_handoff.md`.

```dotenv
PPI_CASH_ASSETS={"ARS":"GF_PPI_CASH_ARS","USD_GLOBAL":"GF_PPI_CASH_USD_GLOBAL","USD_MEP":"GF_PPI_CASH_USD_MEP","USD_CCL":"GF_PPI_CASH_USD_CCL"}
PPI_CASH_ACTIVITY_IMPORT=false
# Experimental only. Required if enabling manual research; do not list an unverified bucket.
PPI_CASH_ENABLED_BUCKETS=ARS,USD_MEP
```

| PPI label family | Ghostfolio asset | ISO currency |
| --- | --- | --- |
| Pesos | `GF_PPI_CASH_ARS` | `ARS` |
| `Dolar Saxo` / global USD | `GF_PPI_CASH_USD_GLOBAL` | `USD` |
| `MEP` / `billete` | `GF_PPI_CASH_USD_MEP` | `USD` |
| `CCL` / `cable` / `divisa` | `GF_PPI_CASH_USD_CCL` | `USD` |

Only during an explicitly controlled experiment, `PPI_CASH_ACTIVITY_IMPORT=true` **and** an explicit `PPI_CASH_ENABLED_BUCKETS` allowlist map an exact PPI `Ingreso de Fondos` to a Ghostfolio `BUY` of the matching cash asset at unit price `1`; `Retiro de Fondos` maps to a `SELL`. A supported investment BUY can create a matching cash SELL, and a supported investment SELL a matching cash BUY, using PPI's signed settlement amount rather than recalculating it. This experimental behavior does not establish complete cash-history coverage or end-balance reconciliation. Unknown labels, disabled buckets, missing cash assets, and broker settlement amounts with an unexpected sign are reported as skipped cash settlements; the investment activity remains eligible for import.

Do not model MEP/CCL conversions automatically yet. They require a verified relationship between the source and destination PPI movements; the synchronizer will not infer one from adjacent cash rows.

## Run

Always start with a dry-run:

```bash
bun run sync --dry-run
```

Other useful commands:

```bash
bun run sync --ppi-only
bun run sync --ppi-orders
bun run sync --ppi-account
bun run sync --ghostfolio-only
bun run sync --bootstrap-holdings --dry-run
```

`--bootstrap-holdings` additionally requires both `BOOTSTRAP_HOLDINGS_FILE` and `BOOTSTRAP_CUTOFF_DATE`; the command fails before contacting Ghostfolio when either is absent.

`--ppi-only` and `--ppi-orders` use `SYNC_FROM_DATE` and `SYNC_TO_DATE` when configured, so diagnostics can remain within the same controlled range as a sync.

When the dry-run output is correct, run the real import:

```bash
bun run sync
```

The process is idempotent: re-running the same source movements does not create duplicates.

Normal sync and bootstrap runs take an atomic process lock before they read or import data. It defaults to the system temporary directory. For scheduled containers or multiple hosts, set `SYNC_LOCK_PATH` to one shared, writable path; separate paths cannot coordinate concurrent imports. The supplied Compose file mounts a named volume at `/var/lib/ppi-sync` for this purpose. Locks from another container host fail closed until their six-hour lease expires; normal completion always removes the lock.

Multiple PPI source accounts always import into the single configured `GHOSTFOLIO_ACCOUNT_ID`. Configure them once in a nonempty, comma-separated `PPI_ACCOUNT_IDS` list; duplicate source IDs fail configuration before PPI or Ghostfolio is contacted. Their versioned fingerprints retain the source account, so identical source IDs or tickers remain isolated in the shared target account. Multi-account runs emit an opaque numbered summary for each source, followed by the aggregate summary; account IDs are never written to logs. An account-local Ghostfolio validation error is retained in the nonzero final report but does not suppress later sources; PPI/transport/uncertain-write failures still stop the run. Do not configure per-account Ghostfolio mappings.

Use a dedicated Ghostfolio test account for every first validation and real import. The [integration and safe-operation playbook](integration-playbook.md) defines the required diagnostic, dry-run, import, rerun, recovery, and data-handling procedure.

### Reconciliation and recovery

Every normal run and dry-run prints `Fetched`, `Mapped`, `Imported`, `Duplicates`, `Unsupported`, `Validation failed`, `HTTP failed`, `Unattempted`, and `Uncertain`. Counts refer to activities except `Fetched`, which refers to source movements. `Mapped` includes later duplicates; `Imported` is confirmed accepted activities (or validated activities in dry-run); and `Duplicates`, `Unsupported`, `Validation failed`, `HTTP failed`, `Unattempted`, and `Uncertain` explain why mapped work was not confirmed imported. `Validation failed` includes local mapping failures and non-transient Ghostfolio `4xx` rejections. `HTTP failed` is reserved for failed reads, transport failures, and transient import failures. `Unattempted` counts activities after a failed batch; `Uncertain` counts activities whose write outcome could not be reconciled safely. Skipped and failed records are identified only by deterministic fingerprints, and every skip includes a movement type and concrete reason. If a Ghostfolio batch fails, the output identifies the failed range and the completed count; rerun the same bounded range after resolving the error. Existing fingerprints prevent duplicate imports.

Ghostfolio comments intentionally contain only `ppi-sync:` or `ppi-bootstrap:` plus an opaque deterministic fingerprint; they do not contain a literal PPI or Ghostfolio account identifier. For support, provide the command, version, UTC time range, summary counts, opaque fingerprints, HTTP status, and sanitized error type. Do not include `.env` values, authorization headers, account numbers, descriptions, or raw PPI/Ghostfolio payloads. `bun run secrets` scans tracked files for likely credential assignments and also verifies diagnostic redaction using synthetic fixtures.

`GHOSTFOLIO_BATCH_SIZE` controls how many activities are sent per import request. It defaults to `100` and accepts only integers from `1` to `500`. Activities retain their source order across batches. A failure reports the batch number, its inclusive activity range, and its actual size.

`--ppi-orders` is a diagnostic read-only command: it reports only the count of historical PPI orders and never prints order IDs or trade details.

### Optional order enrichment

Set `PPI_ORDER_ENRICHMENT=true` only when PPI returns historical rows from its read-only `Order/Orders` endpoint. The synchronizer then adds the documented PPI order ID to a trade fingerprint only when one order matches the movement uniquely across direction, ticker, currency, UTC day, quantity, price, and amount. It never guesses a commission association. Existing imports created without an order ID remain duplicate-safe.

`PPI_ORDER_FALLBACK=true` imports a completed historical order when no matching accounting movement exists yet. This covers PPI orders that appear in **Órdenes históricas** before they appear in **Todos los movimientos**. The order ID is used in the fingerprint, and once the matching movement appears later it is recognized as the same activity. It is opt-in by default; this project's `.env` enables it. Set it to `false` if the account's order feed is incomplete or you require movement-only imports.

## Bootstrap existing holdings

The normal synchronizer does not invent historical BUY activities from current balances. If PPI history is insufficient, use `--bootstrap-holdings` with a user-provided JSON file containing the opening date, quantity, unit price, currency, and symbol. Bootstrap entries have their own deterministic `ppi-bootstrap:` marker and are checked in the configured target account before importing. Both `DRY_RUN=true` and `--dry-run` enable bootstrap validation without persistence.

Bootstrap requires an explicit UTC `BOOTSTRAP_CUTOFF_DATE`. Every bootstrap entry must be dated strictly before that cutoff; normal PPI history starts at the cutoff even if `SYNC_FROM_DATE` is earlier or omitted. This prevents an opening position and its historical source movements from being imported for the same period. If `SYNC_TO_DATE` is earlier than the cutoff, configuration fails before PPI is contacted.

## Docker

```bash
docker build -t ppi-ghostfolio-sync .
docker run --rm --env-file .env ppi-ghostfolio-sync
```

The container is one-shot. Scheduling is intentionally external to the project.

The build requires the committed Bun lockfile (`bun install --frozen-lockfile`); a stale or absent lockfile fails the build rather than resolving new dependencies. The final image runs as the non-root `bun` user and contains only the bundled CLI and runtime manifest; `.env`, tests, local PPI documentation and Git metadata are excluded from the build context.

## Development

```bash
bun run typecheck
bun test
bun run lint
bun run secrets
```

The offline contract corpus in `tests/fixtures/ppi-contract-variants.json` defines the expected normalized transaction and Ghostfolio import payload for each supported activity type. It also covers cash-bucket selection, trade-settlement legs, nullable tickers, decimal precision, and explicitly skipped reversals, ambiguous identities, complex instruments, and unreferenced commissions. It uses only synthetic identifiers and runs without PPI credentials.

## Limitations

- Cash balances, DEPOSIT, WITHDRAWAL, and trade-settlement cash legs are experimental and outside the v1 support contract. `PPI_CASH_ACTIVITY_IMPORT=false` remains the required default; a configured asset map or manual enablement does not establish PPI cash-history coverage or ending-balance reconciliation.
- FCI, cauciones, ONs, amortizing bonds, exchanges, and splits are skipped pending explicit mapping rules and fixtures.
- The observed PPI exchange and split rows have no instrument execution data; they are not converted into synthetic BUY or SELL activities.
- A standalone commission is reported and skipped unless PPI provides a stable association with its originating trade.
- Interest and coupon movements require a supported currency, a positive amount, and a resolvable PPI instrument or explicit override. A PPI `RENTA. / <ticker>` movement can be normalized as `INTEREST`, but bonds still require a pre-created manual Ghostfolio asset and an explicit override. The observed PPI `DolarCV10000-Loc.` currency label remains intentionally unsupported because it does not match a documented AL30 species.

## Publishing

Pushing a tag matching `v*` triggers the GitHub Actions release workflow. It runs typecheck, tests and lint, verifies that the tag matches `package.json`, and publishes the container image to GitHub Container Registry (GHCR). The workflow uses GitHub's built-in token with `packages: write`; no npm token or extra registry secret is required.

For example, tag `v0.2.0` publishes `ghcr.io/tomas-santucho/ghostfolio-ppi-sync:v0.2.0` and updates `ghcr.io/tomas-santucho/ghostfolio-ppi-sync:latest`.

## License

MIT. See `LICENSE`.
