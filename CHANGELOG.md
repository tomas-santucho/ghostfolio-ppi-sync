# Changelog

## v0.5.0 — Release branch

- Added `v0.5.0_final_handoff.md` as the authoritative continuation record, including branch state, verified work, open acceptance criteria, reconciliation boundaries, and safe next steps.
- Versioned sync fingerprints as `v2`, preserved pre-v0.3/v0.3 compatibility candidates, and prevented mapping-identity changes from reimporting source activity.
- Added account-, currency-, market-, and ISIN-scoped symbol overrides with deterministic precedence and conflict checks.
- Enforced target-account-aware duplicate checks and preflight validation of every multi-account mapping.
- Added anonymized, bounded live integration evidence and explicitly recorded the source samples still unverified.
- Simplified multi-account synchronization so every configured PPI source account imports into the single configured Ghostfolio account; removed per-account target mappings.
- Added UUID-backed MANUAL cash and bond mappings after live dry-run validation rejected free-form symbols on the configured Ghostfolio instance.
- Corrected cash DEPOSIT/WITHDRAWAL imports to use cash quantity at unit price 1, preventing deposit amounts from becoming artificial cash-asset prices.
- Isolate Ghostfolio's per-activity validation rejections so one unavailable Yahoo symbol cannot block valid activities in the same import batch.
- Added v0.7.0 roadmap issue R07-03 for cash mergers, delistings, and cash-in-lieu settlements, including the explicit ATVI cash-merger rule.
- Added source-amount-based cash settlement legs for supported investment trades, preventing configured manual cash buckets from double-counting funded purchases and proceeds; settlements are withheld when their investment activity fails Ghostfolio validation.
- Kept all cash activities opt-in behind `PPI_CASH_ACTIVITY_IMPORT=true`; a manual cash-asset mapping alone cannot prove complete PPI cash-history coverage and therefore cannot safely affect portfolio value or performance.
- Recognized observed Saxo `VTAEXT` tickets as sales. During the controlled reconciliation, corrected verified AAPL (4:1) and SGOL (10:1) historical forward splits while preserving original cost, closing the stale active ICLN, MSFT, and SGOL holdings.
- Reject duplicate `PPI_ACCOUNT_IDS` during configuration preflight, rather than silently collapsing a source account from a multi-account run.
- Add opaque per-source summaries to multi-account runs, making shared-target integration evidence auditable without logging account identifiers.
- Continue a multi-account run after an account-local Ghostfolio validation rejection, while retaining the nonzero aggregate outcome; PPI quota, transport, and uncertain-write failures still stop immediately.
- Complete the offline R05-05 contract-fixture corpus for every supported activity type, with explicit normalized results and Ghostfolio payloads. Cover nullable tickers, exact UTC dates, high-precision decimals, ARS/global USD/MEP/CCL buckets, reversals, invalid dates, ambiguous identities, complex instruments, and unreferenced commissions.
- Validate four configured Ghostfolio `GF_` MANUAL cash profiles in dry-run and document their creation and mapping. Cash writes remain disabled pending R05-04 reconciliation.
- Record sanitized multi-source and cash-source evidence, including the accepted provider account-selection limitation and missing global-USD/CCL funding and supported-interest samples.

## v0.4.0 — In development

- Added `v.0.4.0.md` with release notes, migration guidance, recovery behavior, report semantics, safety guidance, verification commands, and limitations.
- Reconciles fingerprinted Ghostfolio activities after an uncertain transport failure before retrying an import.
- Reports uncertain and unattempted activities, preserves partial multi-account totals, and fails runs with local mapping validation errors.
- Makes bootstrap imports target-account-idempotent and honors both `DRY_RUN=true` and `--dry-run`.
- Applies controlled date ranges to PPI diagnostics and classifies authentication HTTP 429 as incomplete history.
- Redacts private account and movement fields in HTTP error details and adds the `bun run secrets` diagnostic-redaction gate.
- Reconciles ambiguous `408` and `5xx` Ghostfolio import responses before retrying, including fresh-process recovery against persisted fingerprints.
- Requires `BOOTSTRAP_CUTOFF_DATE` for opening positions and prevents normal history from overlapping the bootstrap period.
- Adds offline local-service CLI coverage for successful empty runs, invalid ranges, PPI quota stops, and Ghostfolio validation failures.
- Replaces the redaction-only check with a tracked-file secret-check gate that permits placeholders and synthetic fixtures only.
- Separates Ghostfolio non-transient `4xx` validation rejections from transport failures and preserves earlier batch validation failures in partial-run reports.

## v0.3.0 — Planned

- Added `final_release.md` with proposed v0.4.0–v1.0.0 milestones, issue dependencies, acceptance criteria, and release evidence gates.
- Added `RELEASE_NOTES_v0.3.0.md` with the release summary, upgrade configuration, safe-operation procedure, recovery guidance, verification commands, and limitations.
- Added a reproducible integration and safe-operation playbook covering isolated test accounts, diagnostics, dry-run review, controlled imports, duplicate checks, recovery, and secret-handling rules.
- Added configurable `GHOSTFOLIO_BATCH_SIZE` with a default of 100 and strict 1–500 validation; batch failures now include number, range, size, and recovery context.
- Documented and tested PPI quota-exhaustion behavior: initial `429` stops with incomplete history and performs no Ghostfolio write; rerunning after reset remains idempotent.
- Added an actionable final reconciliation report with fetched, mapped, imported, duplicate, unsupported, validation-failed, and HTTP-failed counts.
- Added safe fingerprints and concrete skip reasons; partial Ghostfolio failures now report the affected batch range and completed count.
- Added bounded retry/recovery handling for connection failures and transient responses, including `Retry-After`; PPI `429` stops immediately with incomplete-history status.
- Added `ppi.md` operational guidance to limit PPI API consumption and document response handling.
- Release branch prepared from `release/v0.2.0`.
- Added an inclusive `SYNC_TO_DATE` bound for reproducible, controlled PPI history validation.
- Updated MANUAL cash-asset examples to use Ghostfolio-compatible `GF_` symbols and reject invalid cash-asset symbols at configuration load.
- Added PPI running balance as a fingerprint discriminator so same-day cash movements with identical economics are not collapsed into one import.
- Candidate scope: actionable sync reporting, partial-import recovery, resilient retries, configurable batching, and an end-to-end integration playbook.
- Complex instrument mappings and automatic trade-commission association remain out of scope until stable PPI evidence and anonymized fixtures are available.

## v0.2.0 — In development

- Added `session_2.md` with the full v1.0.0 backlog, next-session priorities, and the evidence required for the remaining open commission issue.
- Added detailed local release notes in `v0.2.0.md`.
- Added opt-in, idempotent DEPOSIT and WITHDRAWAL imports through configured Ghostfolio MANUAL cash assets.
- Kept ARS, global USD, USD MEP, and USD CCL as separate cash asset identities while retaining ISO `ARS`/`USD` currencies.
- Added strict configuration and regression coverage for cash asset buckets; unknown PPI cash labels and unconfigured buckets remain safely skipped.

- Added optional read-only PPI historical-order enrichment using documented PPI order IDs only for unique exact trade matches; existing pre-enrichment fingerprints remain duplicate-safe.
- Corrected INTEREST imports to require a resolvable symbol, as required by Ghostfolio's import contract; added `RENTA. / <ticker>` coupon recognition and explicit skip warnings for unresolved income.
- Confirmed through live dry-run that Ghostfolio accepts a symbol-backed INTEREST import, with no persisted activity.
- Completed a live end-to-end dry-run against the configured accounts: the two selected PPI movements were both identified as existing Ghostfolio activities, with zero unsupported records and no writes.
- Aligned the legacy PPI mapper export with the canonical normalization pipeline to prevent divergent mapping behavior.
- Kept the undocumented PPI `DolarCV10000-Loc.` coupon currency unsupported after verifying it does not match the documented AL30 ARS, CCL, or MEP species; unresolved interest and coupon symbols now require a verified instrument or explicit override.
- Validated the optional historical-order enrichment against the configured PPI account in end-to-end dry-run mode; an empty PPI order history leaves existing duplicate detection unchanged.
- Added `--ppi-orders`, a read-only diagnostic that reports only the historical-order count without logging order data or identifiers.
- Documented the observed PPI exchange and split movement shapes and their intentional omission when no instrument execution data is available.
- Added bounded retries for transient read-only PPI failures while ensuring PPI `429` responses are never retried.
- Verified the multi-stage Docker image builds successfully and exposes the CLI as a one-shot container entrypoint.
- Verified the final Docker image excludes `.env`, source documentation, tests, Git metadata and dependencies, and runs as the non-root `bun` user.
- Completed the validation evidence for dividend, withholding-tax and interest handling, including explicit coupon skip behavior for unresolved PPI currency/instrument identities.
- Accepted nullable `externalID` and `operationMaxDate` fields observed in PPI historical-order responses.
- Verified historical PPI orders against movements and retained exact-only matching after observed price and amount discrepancies prevented a safe association.
- Added a read-only PPI order-detail client to inspect documented order data without exposing any trading operation.
- Confirmed that available PPI order-detail responses contain no additional commission or movement-reference fields, so unmatched commissions remain safely omitted.
- Parse PPI movement numbers losslessly and preserve unsafe numeric tokens as decimal strings.
- Reject lossy decimal conversion at the Ghostfolio boundary; cover large values, underflow and fingerprint compatibility.

- Reject zero, negative and non-finite income rather than converting reversals to receipts.
- Added mixed BUY/SELL/unmatched commission and repeat income synchronization regression coverage.

- Started release branch for cash movements, commission association and income validation.
- Production support remains subject to real contract evidence and regression tests.
- Restricted cash funding classification to observed exact labels, coherent signs and zero execution fields; internal transfers are excluded.
- Added observed dividend withholding labels and rejected reversed withholding signs.
- Corrected interest mapping to preserve the cash amount instead of zero execution quantity/price.
- Reported unreferenced option commissions without attaching them to arbitrary trades.
- Added anonymized cash/income fixtures and regression tests; validated four income/tax payloads via live Ghostfolio dry-run.
- Full cash import and referenced trade commission association remain pending.

## v0.1.0

- Added a GitHub Actions release workflow that publishes versioned Docker images to GitHub Container Registry when `v*` tags are pushed.
- Added comprehensive local release notes for the initial release.
- Fixed the release workflow's package-version verification command for Bash.
- Added a local v1.0.0 GitHub issue backlog for release planning.
- Added an anonymized Ghostfolio fixture for the observed dividend and fee activity response shape.
- Prevented unresolved PPI BUY and SELL symbols from being sent to Ghostfolio without an explicit override.
- Extended the anonymized Ghostfolio response fixture to cover imported BUY activities returned without symbols.
- Corrected PPI account inspection to read runtime grouped instrument positions instead of cash availability.
- Made PPI position metadata tolerant of the numeric and nullable shapes observed in the live account response.
- Added an anonymized fixture for the live PPI grouped-position response shape.

Initial public release of `ghostfolio-ppi-sync`.

### Included

- Read-only PPI client for authentication, historical movements, account balances, and instrument lookup. It contains no trading, order, withdrawal, or account-modification methods.
- Ghostfolio HTTP client with security-token exchange, Bearer authentication, activity reads, import batching, timeouts, retry handling for transient failures, and sanitized HTTP errors.
- A normalization pipeline from PPI movements to Ghostfolio import activities using decimal strings internally for quantities, prices, and fees.
- Support for BUY, SELL, DIVIDEND, INTEREST, and FEE activity mappings where the PPI movement has an unambiguous representation.
- Currency normalization for ARS and USD PPI labels, including MEP and CCL variants.
- Deterministic SHA-256 fingerprints stored in Ghostfolio comments for idempotent imports.
- `--dry-run`, `--ppi-only`, `--ppi-account`, `--ghostfolio-only`, and explicit `--bootstrap-holdings` CLI modes.
- Explicit, idempotent bootstrap support for holdings when the user provides opening date, quantity, and cost.
- Instrument resolution safeguards: US equities use Yahoo when PPI identity is unambiguous; BYMA equities/CEDEARs may use `.BA`; BYMA bonds require explicit MANUAL overrides.
- Separate manual Ghostfolio assets for AL30, AL30C, and AL30D to preserve their respective ARS, CCL, and MEP trading identities.
- Multi-account PPI-to-Ghostfolio mapping, symbol overrides, Docker one-shot execution, and GitHub Actions publication on version tags.
- Strict TypeScript, Zod validation, Bun tests, linting, fixtures, and security-focused logging.

### Current limitations

- Deposits and withdrawals are intentionally skipped because the current Ghostfolio import contract does not accept them.
- FCI, cauciones, ONs, amortizing bonds, exchanges, splits, and ambiguous PPI movements are skipped with warnings.
- Trade commissions are not guessed when PPI does not supply a stable association to an individual trade.
- BYMA bonds must have a pre-created Ghostfolio MANUAL asset and an explicit override.
