# Ghostfolio PPI Sync v1.0.0

`ghostfolio-ppi-sync` is a read-only importer from Portfolio Personal Inversiones (PPI) into Ghostfolio. It reads PPI account activity and current positions, then creates or updates Ghostfolio activities. It does not place orders, transfer funds, or modify PPI.

This is the final v1.0.0 release. The recommended operation for an account whose PPI history is incomplete is the MEP holdings projection described below: it shows current instruments and quantities in Ghostfolio while preserving the MEP total entered from PPI.

## What v1.0.0 does

- Imports supported PPI BUY, SELL, DIVIDEND, INTEREST and FEE movements into Ghostfolio.
- Keeps reruns idempotent using stable activity identities; recognized activities are reported as duplicates instead of being re-created.
- Supports one PPI source account, multiple sources to a shared Ghostfolio account, or an isolated ARS/USD Ghostfolio account pair for each PPI source.
- Refreshes a PPI or Ghostfolio credential once after an HTTP 401 and fails if the renewed credential is also rejected.
- Stops immediately on a PPI 429 rate-limit response; it never continues issuing PPI reads after that response.
- Uses an exclusive lock so concurrent commands or containers cannot write the same Ghostfolio target at once.
- Supports an instrument-level MEP holdings projection, including PPI quantities, current MEP allocation, and optional PPI period performance.
- Builds and publishes a Linux `amd64` and `arm64` OCI image when a matching `v*` tag is pushed.

## What v1.0.0 does not promise

- Full PPI cash-ledger reconstruction or reconciliation. Cash import is disabled by default and experimental.
- Complete treatment of FCI, cauciones, ONs, amortizing bonds, exchanges, splits, or other corporate actions without an explicit mapping and fixture.
- Automatic reconstruction of positions that predate the PPI movement history returned to the importer.
- All-time, lot-level PPI performance for projected holdings. The optional performance mode projects a PPI period return, not a tax or cost-basis report.

## Requirements

- Bun 1.x for local execution.
- A PPI API credential set with read access to the account history and positions endpoints.
- A Ghostfolio self-hosted instance and a Ghostfolio access token or security token.
- One or more Ghostfolio accounts created by the operator.
- Docker with Compose for container execution; Docker Buildx/QEMU is only needed to publish a multi-architecture image.

## Install and validate

```bash
git clone https://github.com/tomas-santucho/ghostfolio-ppi-sync.git
cd ghostfolio-ppi-sync
git checkout v1.0.0
bun install --frozen-lockfile
Copy-Item .env.example .env
bun run typecheck
bun test
bun run lint
bun run secrets
```

On Linux or macOS, replace the PowerShell copy command with `cp .env.example .env`.

Never commit `.env`. Keep PPI credentials and Ghostfolio tokens in a secret manager or in the deployment environment.

## Required configuration

At minimum, set these values in `.env`:

```dotenv
PPI_API_URL=https://your-real-ppi-api
PPI_AUTHORIZED_CLIENT=...
PPI_CLIENT_KEY=...
PPI_PUBLIC_KEY=...
PPI_PRIVATE_KEY=...
PPI_ACCOUNT_ID=your-primary-ppi-account
PPI_ACCOUNT_IDS=your-primary-ppi-account

GHOSTFOLIO_URL=https://your-ghostfolio
GHOSTFOLIO_ACCESS_TOKEN=...
GHOSTFOLIO_ACCOUNT_ID=your-ghostfolio-account
```

`GHOSTFOLIO_SECURITY_TOKEN` can be used instead of `GHOSTFOLIO_ACCESS_TOKEN`. The application exchanges a security token for a short-lived Ghostfolio bearer token at runtime.

Choose exactly one normal historical-import target mode:

| Mode | Configuration | Use it when |
| --- | --- | --- |
| Single target | `GHOSTFOLIO_ACCOUNT_ID` | One Ghostfolio account receives all supported activity. |
| Currency split | `GHOSTFOLIO_ACCOUNT_ID_ARS` and `GHOSTFOLIO_ACCOUNT_ID_USD` | ARS and USD activity must be separated. Do not set the legacy single target. |
| Per-source currency split | `PPI_GHOSTFOLIO_ACCOUNT_TARGETS` | Multiple PPI sources need independent ARS/USD Ghostfolio accounts. Do not set either other target mode. |

Example per-source mapping:

```dotenv
PPI_ACCOUNT_IDS=ppi-source-1,ppi-source-2
PPI_GHOSTFOLIO_ACCOUNT_TARGETS={"ppi-source-1":{"ARS":"ghost-1-ars","USD":"ghost-1-usd"},"ppi-source-2":{"ARS":"ghost-2-ars","USD":"ghost-2-usd"}}
```

## Standard historical activity sync

Always begin with a dry-run:

```bash
bun run sync --dry-run
bun run sync
```

Optionally bound a historical import:

```dotenv
SYNC_FROM_DATE=2024-01-01
SYNC_TO_DATE=2024-01-31
```

`SYNC_TO_DATE` is inclusive. An invalid range fails before PPI is contacted.

The standard importer only creates supported, normalized activities. It deliberately skips unsupported operations instead of inventing a trade. Review the final summary before treating a run as complete:

- `Imported`: confirmed Ghostfolio writes.
- `Duplicates`: already-present activities; expected on a clean rerun.
- `Unsupported`: PPI operations intentionally not mapped in v1.
- `Validation failed`: activities rejected by Ghostfolio.
- `HTTP failed`, `Unattempted`, or `Uncertain`: stop and investigate before scheduling another import.

## Current MEP holdings projection

Use this mode when PPI's returned movement history is incomplete but PPI's account page exposes the current MEP total and current positions. It creates one Ghostfolio holding per instrument—not a single anonymous balance asset.

1. Create one separate USD Ghostfolio account per PPI source used for the projection.
2. Set each of those Ghostfolio accounts' cash balance to zero.
3. Keep projected accounts separate from historical activity accounts. Do not include both representations in analysis, or the value will be counted twice.
4. In PPI **Estado de cuenta**, select **MEP**, note `Total valorizado` and `Rendimiento últ. 30 días` for every source.
5. Configure the accounts and totals in `PPI_MEP_BALANCE_PROJECTION`, in exactly the same order as `PPI_ACCOUNT_IDS`.

Example:

```dotenv
PPI_ACCOUNT_IDS=ppi-source-1,ppi-source-2
PPI_MEP_BALANCE_PROJECTION={"accountIds":["ghostfolio-mep-source-1","ghostfolio-mep-source-2"],"values":[2472.29,178.97],"performancePercentages":[3.37,0.21],"performanceDays":30,"asOfDate":"2026-09-12"}
```

Run it:

```bash
bun run sync --sync-mep-holdings --dry-run
bun run sync --sync-mep-holdings
```

The command reads PPI's current position groups and preserves actual PPI quantities. It allocates the explicit, authoritative source MEP total across those positions using PPI's current group and instrument values. This lets Ghostfolio show the instruments in **Holdings** while keeping **Overview** aligned with PPI.

The command updates the same instrument projection activities in place. A rerun with unchanged PPI data produces duplicates, not additional holdings. Live market data can legitimately cause an update between consecutive runs because the allocation changes while the configured source total remains fixed.

### Projected performance

Omit `performancePercentages` if no PPI period return has been checked. In that case Ghostfolio correctly reports `0.00%`: a current-position snapshot has no complete historical cost basis.

When the array is configured, each entry must correspond to one PPI source. `performanceDays` defaults to 30 and `asOfDate` must be the valuation date shown by PPI. The importer creates manual market data at the start and end of the period, so Ghostfolio calculates the supplied period return while preserving the configured current value.

This is a source-level period-return projection. It is not all-time, security-level PPI performance. Refresh the PPI totals, percentages, and `asOfDate` before each scheduled projection run.

### Legacy aggregate MEP projection

```bash
bun run sync --sync-mep-balances --dry-run
bun run sync --sync-mep-balances
```

This older mode creates one manual asset per PPI source. Use it only when an aggregate balance is desired. Do not run aggregate and instrument-level MEP projections into the same Ghostfolio accounts. If migrating, import and verify holdings first, then remove the two legacy aggregate activities to avoid double counting.

## Bootstrap holdings

Bootstrap is for an explicit opening position that predates usable PPI history. It is not an automatic current-position importer.

Set a cutoff date, create a JSON holdings file, and use a single legacy Ghostfolio target:

```dotenv
GHOSTFOLIO_ACCOUNT_ID=ghostfolio-account
BOOTSTRAP_HOLDINGS_FILE=./holdings.json
BOOTSTRAP_CUTOFF_DATE=2024-01-02
```

```json
[
  {
    "symbol": "AAPL",
    "currency": "USD",
    "quantity": "2",
    "unitPrice": "100.25",
    "date": "2024-01-01T00:00:00.000Z",
    "isin": "US0378331005",
    "market": "NASDAQ"
  }
]
```

```bash
bun run sync --bootstrap-holdings --dry-run
bun run sync --bootstrap-holdings
```

Every bootstrap entry must be strictly before `BOOTSTRAP_CUTOFF_DATE`. Normal historical PPI sync starts at that cutoff, preventing the same opening position and later source activity from being counted twice.

## Diagnostic commands

```bash
# Print help
bun run sync --help

# Read PPI movements only
bun run sync --ppi-only

# Read PPI historical order count only
bun run sync --ppi-orders

# Read current PPI positions only
bun run sync --ppi-account

# Check Ghostfolio activity access
bun run sync --ghostfolio-only

# Validate a synthetic Ghostfolio import without persisting it
bun run sync --ghostfolio-import-dry-run
```

## Cash import status

Cash is outside the v1 support contract. Keep this default:

```dotenv
PPI_CASH_ACTIVITY_IMPORT=false
```

The code has an experimental path for ARS/MEP cash activities when every enabled bucket maps to a manually created Ghostfolio asset. Enabling it does not establish complete PPI cash history or ending-balance reconciliation. Do not enable USD Global or CCL cash without verified source coverage.

## Docker and scheduled operation

Build and execute locally:

```bash
docker build -t ghostfolio-ppi-sync:v1.0.0 .
docker run --rm --env-file .env ghostfolio-ppi-sync:v1.0.0 --dry-run
```

The provided Compose file shares a lock volume across one-shot containers:

```bash
docker compose -f docker-compose.example.yml run --rm ppi-ghostfolio-sync --dry-run
docker compose -f docker-compose.example.yml run --rm ppi-ghostfolio-sync --sync-mep-holdings
```

For scheduled execution, set the same `SYNC_LOCK_PATH` for every process or container targeting the same Ghostfolio account. Use `--dry-run` during setup, inspect its result, then schedule the non-dry-run command. A nonzero exit code is actionable; do not overlap scheduled runs.

The release workflow publishes the following image platforms after pushing a tag whose version matches `package.json`:

```bash
git tag v1.0.0
git push origin v1.0.0
docker pull ghcr.io/tomas-santucho/ghostfolio-ppi-sync:v1.0.0
```

The workflow publishes `linux/amd64` and `linux/arm64`, and also updates `latest`.

## Operational recovery

1. If PPI returns 429, stop. Wait for PPI's quota window before any new PPI request.
2. If the command reports `Uncertain`, do not assume a write failed or succeeded. Re-run the same controlled range in dry-run first; the importer reconciles stable activity identities.
3. If Ghostfolio rejects a validation batch, correct the mapping, symbol override, or target account before rerunning.
4. If activity history is incomplete, prefer an explicit bootstrap or the MEP holdings projection. Do not manufacture historical BUY/SELL activity from a current balance.
5. If Holdings and Overview differ from PPI after a projection, confirm that old aggregate snapshot activities and historical accounts are excluded or removed before changing the configured PPI source total.

## Security and data handling

- PPI credentials and Ghostfolio tokens are redacted from application error details.
- Keep `.env` untracked and restrict its filesystem permissions.
- Use a Ghostfolio token scoped to the intended user and environment.
- Verify the Ghostfolio base URL before first import; activity writes are real once dry-run is disabled.
- PPI access is read-only by design in this project; it never invokes trading endpoints.

## Release verification

The v1.0.0 release gate is:

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run lint
bun run secrets
git diff --check
```

For production, additionally run a Ghostfolio dry-run, the intended PPI dry-run, then one normal import or holdings projection, followed by the same dry-run again. The second controlled run should report no unexpected imports.
