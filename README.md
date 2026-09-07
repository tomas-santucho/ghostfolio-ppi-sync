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

The current release supports unambiguous BUY, SELL, DIVIDEND, INTEREST, and FEE mappings. ARS and USD PPI currency labels are normalized to ISO currency codes.

PPI and Ghostfolio data is validated with Zod. Amounts, quantities, prices, and fees remain decimal strings inside the domain model and are converted only at the Ghostfolio HTTP boundary.

Unsupported or ambiguous movements are logged as warnings and skipped.

Read-only PPI requests use timeouts and bounded retries for connection failures, transient `408`, and `5xx` responses. A PPI `429` rate limit is never retried: it stops the run immediately, marks history as incomplete, and returns a nonzero exit code. See [the PPI operating guide](ppi.md) before running diagnostics or a production sync.

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

Optional variables include `PPI_ACCOUNT_IDS`, `PPI_GHOSTFOLIO_ACCOUNT_MAP`, `PPI_SYMBOL_OVERRIDES`, `PPI_CASH_ASSETS`, and `BOOTSTRAP_HOLDINGS_FILE`.

Use `SYNC_FROM_DATE` and optional inclusive `SYNC_TO_DATE` to restrict a historical sync to a controlled date range.

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

## PPI cash balances: ARS, USD, MEP and CCL

Deposits and withdrawals are opt-in. Before enabling them, create four `MANUAL` assets in Ghostfolio and use their symbols below. PPI has distinct USD custody/settlement buckets; Ghostfolio still uses ISO `USD`, so the asset identity — rather than the currency code — keeps them separate.

```dotenv
PPI_CASH_ASSETS={"ARS":"GF_PPI_CASH_ARS","USD_GLOBAL":"GF_PPI_CASH_USD","USD_MEP":"GF_PPI_CASH_USD_MEP","USD_CCL":"GF_PPI_CASH_USD_CCL"}
```

| PPI label family | Ghostfolio asset | ISO currency |
| --- | --- | --- |
| Pesos | `GF_PPI_CASH_ARS` | `ARS` |
| `Dolar Saxo` / global USD | `GF_PPI_CASH_USD` | `USD` |
| `MEP` / `billete` | `GF_PPI_CASH_USD_MEP` | `USD` |
| `CCL` / `cable` / `divisa` | `GF_PPI_CASH_USD_CCL` | `USD` |

With this configuration, an exact PPI `Ingreso de Fondos` becomes a Ghostfolio `BUY` of the matching cash asset at unit price `1`; `Retiro de Fondos` becomes a `SELL`. The normalized record and its fingerprint retain the original `DEPOSIT` or `WITHDRAWAL` meaning. Unknown labels, transfers, and cash assets omitted from the configuration are warned and skipped.

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

When the dry-run output is correct, run the real import:

```bash
bun run sync
```

The process is idempotent: re-running the same source movements does not create duplicates.

### Reconciliation and recovery

Every normal run and dry-run prints `Fetched`, `Mapped`, `Imported`, `Duplicates`, `Unsupported`, `Validation failed`, and `HTTP failed`. Skipped and failed records are identified only by deterministic fingerprints, and every skip includes a movement type and concrete reason. If a Ghostfolio batch fails, the output identifies the failed range and the completed count; rerun the same bounded range after resolving the error. Existing fingerprints prevent duplicate imports.

`GHOSTFOLIO_BATCH_SIZE` controls how many activities are sent per import request. It defaults to `100` and accepts only integers from `1` to `500`. Activities retain their source order across batches. A failure reports the batch number, its inclusive activity range, and its actual size.

`--ppi-orders` is a diagnostic read-only command: it reports only the count of historical PPI orders and never prints order IDs or trade details.

### Optional order enrichment

Set `PPI_ORDER_ENRICHMENT=true` only when PPI returns historical rows from its read-only `Order/Orders` endpoint. The synchronizer then adds the documented PPI order ID to a trade fingerprint only when one order matches the movement uniquely across direction, ticker, currency, UTC day, quantity, price, and amount. It never guesses a commission association. Existing imports created without an order ID remain duplicate-safe.

## Bootstrap existing holdings

The normal synchronizer does not invent historical BUY activities from current balances. If PPI history is insufficient, use `--bootstrap-holdings` with a user-provided JSON file containing the opening date, quantity, unit price, currency, and symbol. Run its dry-run first.

## Docker

```bash
docker build -t ppi-ghostfolio-sync .
docker run --rm --env-file .env ppi-ghostfolio-sync
```

The container is one-shot. Scheduling is intentionally external to the project.

The final image runs as the non-root `bun` user and contains only the bundled CLI and runtime manifest; `.env`, tests, local PPI documentation and Git metadata are excluded from the build context.

## Development

```bash
bun run typecheck
bun test
bun run lint
```

## Limitations

- DEPOSIT and WITHDRAWAL require the explicit `PPI_CASH_ASSETS` configuration and pre-created Ghostfolio MANUAL assets. They are otherwise skipped.
- FCI, cauciones, ONs, amortizing bonds, exchanges, and splits are skipped pending explicit mapping rules and fixtures.
- The observed PPI exchange and split rows have no instrument execution data; they are not converted into synthetic BUY or SELL activities.
- A standalone commission is reported and skipped unless PPI provides a stable association with its originating trade.
- Interest and coupon movements require a supported currency, a positive amount, and a resolvable PPI instrument or explicit override. A PPI `RENTA. / <ticker>` movement can be normalized as `INTEREST`, but bonds still require a pre-created manual Ghostfolio asset and an explicit override. The observed PPI `DolarCV10000-Loc.` currency label remains intentionally unsupported because it does not match a documented AL30 species.

## Publishing

Pushing a tag matching `v*` triggers the GitHub Actions release workflow. It runs typecheck, tests and lint, verifies that the tag matches `package.json`, and publishes the container image to GitHub Container Registry (GHCR). The workflow uses GitHub's built-in token with `packages: write`; no npm token or extra registry secret is required.

For example, tag `v0.2.0` publishes `ghcr.io/tomas-santucho/ghostfolio-ppi-sync:v0.2.0` and updates `ghcr.io/tomas-santucho/ghostfolio-ppi-sync:latest`.

## License

MIT. See `LICENSE`.
