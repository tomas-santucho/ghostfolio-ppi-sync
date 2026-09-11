# v1.0.0 release notes

`v1.0.0` promotes the validated runtime from `v1.0.0-rc.1` to the stable
release. No runtime source files changed after candidate commit `08d1ef6`.

## Supported contract

- Unambiguous BUY/SELL, dividends, verified interest, and valid fees/taxes.
- Bootstrap holdings, multiple PPI source accounts into one Ghostfolio target,
  deterministic fingerprints, idempotence, recovery, and concurrent-run locks.
- Deliberately unsupported rows are skipped with deterministic reasons rather
  than approximated.

Cash balances, deposits, withdrawals, and trade-settlement cash legs are not
part of the stable v1 contract. `PPI_CASH_ACTIVITY_IMPORT=false` remains the
required default; ARS/MEP mapping is experimental if manually enabled, and
USD Global/CCL remain unverified. PPI cash reconciliation continues as #22
post-v1 work.

## Upgrade from v0.5

1. Keep the existing Ghostfolio target account and fingerprints; no existing
   activity is deleted or rewritten.
2. Start with a bounded `SYNC_FROM_DATE` / `SYNC_TO_DATE` dry-run. Investigate
   any ambiguity before a real import.
3. Keep `PPI_CASH_ACTIVITY_IMPORT=false`; do not use a cash asset map as proof
   of cash-balance reconciliation.
4. When bootstrapping, set `BOOTSTRAP_HOLDINGS_FILE` and
   `BOOTSTRAP_CUTOFF_DATE`; bootstrap dates must precede normal history.
5. For scheduled containers, use the supplied Compose volume and one shared
   `SYNC_LOCK_PATH` for every execution targeting the same Ghostfolio account.

## Verification and publication

The RC campaign passed 144 tests with zero failures, Bun `1.3.2`, and the
Ghostfolio target frontend reported `2024.11.0`. The stable tag triggers the
same frozen-lockfile multi-platform publication for `linux/amd64` and
`linux/arm64`. Published stable digests and server pull/smoke evidence are
recorded in `STABLE_RELEASE_EVIDENCE_v1.0.0.md`.

The version-and-documentation-only stable commit was proportionally
revalidated with typecheck, the complete test suite, lint, secret scan, and
dependency audit. A bounded real PPI dry-run also completed successfully with
zero fetched/mapped/imported records and zero validation, HTTP, or uncertain
outcomes; no rate limit occurred.
