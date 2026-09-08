# v0.5.0 isolated integration evidence

This record contains no credentials, account identifiers, movement text, raw payloads, or financial values.

| Check | Configuration shape | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| Ghostfolio activity read | Dedicated configured target; read-only | Authentication and activity read succeed | Activity read succeeded; count retained only in local run output | Pass |
| Ghostfolio import contract | Dedicated configured target; `--ghostfolio-import-dry-run` | One synthetic activity validates with no persistence | One activity validated; command reported no persistence | Pass |
| PPI bounded movement read | Read-only; `SYNC_FROM_DATE=2026-09-01`, `SYNC_TO_DATE=2026-09-08` | PPI authentication and bounded read succeed without quota exhaustion | Read succeeded with zero movements and no HTTP 429 | Pass |

## Evidence boundaries

- Commit under evaluation: `97fc7f0`.
- PPI and Ghostfolio identifiers were intentionally omitted.
- No normal Ghostfolio import was run and no activity was persisted during these checks.
- The bounded PPI interval contained no source samples. BUY, SELL, dividend, interest, tax/fee, deposit, withdrawal, and ARS/global USD/MEP/CCL reconciliation remain explicitly unverified against live source data.
- A two-source-account integration result is also unverified because the active local configuration exposes only one source-account setting. Offline tests cover account isolation, incomplete-map preflight, shared-target policy, and resumption.
- Do not broaden the live PPI range without an approved, dedicated-account test window. Stop immediately if PPI returns HTTP 429.
