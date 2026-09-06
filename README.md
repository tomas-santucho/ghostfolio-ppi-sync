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

GHOSTFOLIO_URL=https://ghostfolio.example
GHOSTFOLIO_SECURITY_TOKEN=...
GHOSTFOLIO_ACCOUNT_ID=...

SYNC_FROM_DATE=2024-01-01
DRY_RUN=false
LOG_LEVEL=info
```

`GHOSTFOLIO_ACCESS_TOKEN` can be used instead of `GHOSTFOLIO_SECURITY_TOKEN`. The latter is exchanged for an ephemeral Ghostfolio Bearer token at runtime.

Optional variables include `PPI_ACCOUNT_IDS`, `PPI_GHOSTFOLIO_ACCOUNT_MAP`, `PPI_SYMBOL_OVERRIDES`, and `BOOTSTRAP_HOLDINGS_FILE`.

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

## Run

Always start with a dry-run:

```bash
bun run sync --dry-run
```

Other useful commands:

```bash
bun run sync --ppi-only
bun run sync --ppi-account
bun run sync --ghostfolio-only
bun run sync --bootstrap-holdings --dry-run
```

When the dry-run output is correct, run the real import:

```bash
bun run sync
```

The process is idempotent: re-running the same source movements does not create duplicates.

## Bootstrap existing holdings

The normal synchronizer does not invent historical BUY activities from current balances. If PPI history is insufficient, use `--bootstrap-holdings` with a user-provided JSON file containing the opening date, quantity, unit price, currency, and symbol. Run its dry-run first.

## Docker

```bash
docker build -t ppi-ghostfolio-sync .
docker run --rm --env-file .env ppi-ghostfolio-sync
```

The container is one-shot. Scheduling is intentionally external to the project.

## Development

```bash
bun run typecheck
bun test
bun run lint
```

## Limitations

- DEPOSIT and WITHDRAWAL are skipped because the current Ghostfolio import endpoint rejects those types.
- FCI, cauciones, ONs, amortizing bonds, exchanges, and splits are skipped pending explicit mapping rules and fixtures.
- Fees are imported only when their association with a movement is unambiguous.

## Publishing

Pushing a tag matching `v*` triggers the GitHub Actions release workflow. It runs typecheck, tests and lint, verifies that the tag matches `package.json`, and publishes the container image to GitHub Container Registry (GHCR). The workflow uses GitHub's built-in token with `packages: write`; no npm token or extra registry secret is required.

For example, tag `v0.1.0` publishes `ghcr.io/tomas-santucho/ghostfolio-ppi-sync:v0.1.0` and updates `ghcr.io/tomas-santucho/ghostfolio-ppi-sync:latest`.

## License

MIT. See `LICENSE`.
