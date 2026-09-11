# v1.0.0-rc.1 release notes

`v1.0.0-rc.1` freezes the v1 feature contract. It is a release candidate, not the final stable tag.

## Stable v1 contract

- Unambiguous BUY/SELL, dividends, verified interest, and valid fees/taxes.
- Position bootstrap, multiple PPI sources into one Ghostfolio account, deterministic fingerprints, idempotence, bounded retry/recovery, and concurrent-run protection.
- Unsupported rows are skipped with deterministic reasons instead of being approximated.

## Explicitly outside v1

- PPI cash reconciliation for every bucket.
- Cash ARS and USD MEP are experimental and disabled by default.
- USD Global and USD CCL cash are unsupported and unverified.
- Deposits, withdrawals, and trade-settlement cash legs are experimental, even when manually enabled with `PPI_CASH_ACTIVITY_IMPORT=true`.
- FCI, cauciones, ONs/amortizations, conversions, and corporate actions without verified settlement evidence.
- Heuristic commission-to-trade association.

The 2016–2026 controlled history proves importer recovery and idempotence: 90 accepted writes followed by a rerun with `Imported=0` and `Duplicates=181`, without validation, HTTP, or uncertain outcomes. It also proves why cash is deferred: the source model intentionally excludes flows needed to reconstruct current ARS and MEP balances. Issue #22 remains open as post-v1 cash reconciliation work.

## Operator notes

Keep `PPI_CASH_ACTIVITY_IMPORT=false`. Manually enabling it is an unsupported experiment and must not be used to assert that Ghostfolio cash or performance equals the complete PPI account. Ghostfolio performance can differ when PPI cash flows, fees, conversions, or settlements fall outside the supported set.

The tag triggers the reproducible GHCR publication workflow for `linux/amd64` and `linux/arm64`. The remaining RC gates are the fault-injection campaign, pull-and-smoke verification of published image digests, and real scheduler/container validation using one shared `SYNC_LOCK_PATH`.
