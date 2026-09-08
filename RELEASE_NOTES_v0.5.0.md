# Ghostfolio PPI Sync v0.5.0

## Release summary

v0.5.0 strengthens duplicate protection, multi-account safety, mapping validation, and offline contract coverage for the supported PPI-to-Ghostfolio synchronization paths. It also documents the safe setup for separate Ghostfolio cash profiles.

## Highlights

- Fingerprints now use a versioned `v2` identity while continuing to recognize compatible historic identities. Upgrading does not delete or rewrite previous Ghostfolio activities.
- Symbol overrides can be scoped by PPI account, currency, market, and ISIN. Conflicting equally specific rules fail before import.
- Multiple PPI source accounts feed one configured Ghostfolio account. Source identity remains part of each fingerprint, duplicate source IDs are rejected at configuration time, and logs provide opaque per-source summaries without printing account IDs.
- An account-local Ghostfolio validation rejection is included in the final nonzero report but does not prevent later source accounts from running. PPI rate limits, transport failures, and uncertain writes still stop immediately.
- The offline fixture corpus now verifies explicit normalized data and Ghostfolio import payloads for every supported activity type: BUY, SELL, DIVIDEND, INTEREST, FEE, DEPOSIT, and WITHDRAWAL. It includes cash buckets, precision boundaries, nullable tickers, reversals, invalid dates, ambiguous identities, complex instruments, and unreferenced commissions.

## Ghostfolio cash profiles

For the four distinct PPI cash buckets, create separate Ghostfolio manual profiles: `GF_PPI_CASH_ARS`, `GF_PPI_CASH_USD_GLOBAL`, `GF_PPI_CASH_USD_MEP`, and `GF_PPI_CASH_USD_CCL`.

In Ghostfolio, choose **Add asset profile** → **Add manually**. Select the currency and **Cash** when available. If Ghostfolio supplies the `GF_` prefix, enter only the remaining text, such as `PPI_CASH_ARS`. Do not create opening BUY activities. Configure the full identifiers in `PPI_CASH_ASSETS` and leave `PPI_CASH_ACTIVITY_IMPORT=false` until cash reconciliation is complete.

## Important limitations

Cash importing is intentionally still disabled by default. The bounded source history lacks global-USD funding, CCL funding, and supported-interest examples; it also lacks a controlled cash write, duplicate-free rerun, recovery proof, and ATVI cash-merger reconciliation. R05-04 / #22 therefore remains open.

The known PPI account-selection discrepancy is documented and the shared-target multi-source policy has been accepted for R05-03 / #21, pending GitHub issue-text cleanup. Do not enable unsupported corporate actions: ATVI must not be represented as a normal sale or as MSFT shares without verified broker settlement evidence.

## Verification

The release working tree passed `bun run typecheck`, `bun test`, `bun run lint`, and `bun run secrets`: 134 tests and 450 assertions.

For the full sanitized evidence and the next-agent checklist, read `integration-evidence-v0.5.0.md` and `v0.5.0_final_handoff.md`.
