# Roadmap to v1.0.0

## Purpose and baseline

This is a proposed implementation and release plan based on the local v0.3.0 code review. It defines milestones, issues, dependencies, and acceptance criteria; it does not claim that those milestones have shipped or that new GitHub issues have been created.

Identifiers such as R04-01 are planning IDs, not GitHub issue numbers. When creating issues, use the title, milestone, and acceptance criteria below. Existing issues #7–#11 delivered the initial operational features; follow-up issues are needed where the implementation does not yet prove the stronger reliability guarantees. Commission association was historically tracked as #3; verify its current GitHub state before creating a duplicate.

The baseline includes core BUY/SELL, dividend, supported interest/tax/fee paths, opt-in cash assets, configurable batches, controlled sync dates, reports, retry handling, and operational documentation. v0.5.0 has versioned identity, scoped overrides, shared-target multi-account orchestration, explicit contract fixtures, and documented MANUAL cash-account setup. The last recorded local verification passed 134 tests, typecheck, lint, and the secret scan. Bounded live evidence is recorded in `integration-evidence-v0.5.0.md`; it does not establish comprehensive cash reconciliation, all currencies, or all instrument support.

## Current v0.5.0 closure assessment

| Issue | Status | Evidence / remaining work |
| --- | --- | --- |
| R05-01 / #19 | Ready to close | v2 canonical identities, compatible legacy matching, migration safeguards, documentation, and regression coverage are implemented. |
| R05-02 / #20 | Ready to close | Scoped overrides, conflict detection, provider/manual validation, documentation, and tests are implemented. |
| R05-03 / #21 | Ready to close after issue-text revision | Offline isolation/recovery coverage and a sequential two-source shared-target dry-run are complete. The supplied secondary identifier's isolated provider behavior remains documented as an accepted limitation; replace obsolete per-target-map wording in GitHub #21 before closing it. |
| R05-04 / #22 | Open | The bounded read-only inventory has ARS/MEP funding examples but no global-USD/CCL funding or supported-interest sample. Cash writes remain guarded; end-to-end reconciliation, a controlled write/rerun/recovery record, and ATVI cash-merger handling are incomplete. |
| R05-05 / #23 | Ready to close | `ppi-contract-variants.json` supplies an explicit normalized result and Ghostfolio payload for each supported type, including exact UTC dates, cash buckets, and settlements. Offline regression cases cover nullable tickers, decimal precision, reversals, invalid dates, ambiguous identities, complex instruments, and unreferenced commissions. |

## Milestone sequence

| Version / milestone | Objective | Exit gate |
| --- | --- | --- |
| v0.4.0 — Reliability and truthful reporting | Make retries, bootstrap, errors, and quota handling safe | R04-01 through R04-05 accepted; no unresolved critical correctness failures |
| v0.5.0 — Identity, accounts, and reconciliation | Stabilize identifiers and validate the supported portfolio scope | In progress: R05-01/R05-02/R05-05 ready; R05-03 and R05-04 remain open |
| v0.6.0 — Funds and financing | Add evidence-backed FCI and cauciones support | R06-01 and R06-02 accepted, or explicitly deferred by a scope decision |
| v0.7.0 — Debt and corporate actions | Add ONs, amortization, and corporate-action handling | R07-01 through R07-03 accepted, or explicitly deferred |
| v0.8.0 — Commission completeness and scope freeze | Resolve commission evidence and agree the v1 support contract | R08-01 resolved or explicitly deferred; R08-02 accepted |
| v0.9.0 — Release candidate preparation | Exercise production-shaped workflows and publication | R09-01 through R09-03 accepted |
| v1.0.0 — Stable release | Publish the validated support contract and artifacts | R10-01 accepted against the exact release commit |

Versions express delivery order, not promised dates. v0.4.0 and v0.5.0 correctness work is mandatory. New instrument families are part of the original full backlog but may move beyond v1 only through a recorded scope decision. Until then, they remain planned work. Do not mark deferred functionality as implemented.

## v0.4.0 — Reliability and truthful reporting

### R04-01 — Reconcile uncertain Ghostfolio writes before retrying

Priority: critical. Follow-up to #8. The import client currently retries a POST after a connection failure without checking whether Ghostfolio already persisted it.

Acceptance criteria:

- Simulate a server persisting a batch and then dropping the response; retry/resumption creates each activity exactly once.
- Before resending an uncertain write, reconcile against existing activities using target-account-aware fingerprints, or demonstrate an equivalent supported server idempotency contract with tests.
- Handle partially persisted batches by submitting only missing activities, retaining deterministic order.
- If reconciliation cannot establish the outcome, stop with an explicit unknown-outcome error rather than blindly resending.
- Retry only eligible transport/transient failures; malformed successful responses and validation failures must not accidentally enter the connection-retry path.
- Cover a middle batch, timeout after persistence, partial persistence, failed reconciliation, and a fresh-process rerun with a stateful fake server.

### R04-02 — Make reports and exit codes describe the complete run

Priority: high. Follow-up to #7. Local validation failures can currently return success; later account failures discard previous account totals; unattempted batches lack explicit accounting.

Acceptance criteria:

- Any mapped activity that fails validation or import produces a nonzero CLI exit, including failures before candidates are submitted.
- Preserve successful earlier-account totals when a subsequent account fails.
- Distinguish unsupported records, duplicates, validation failures, failed requests, confirmed imports, unattempted activities, and uncertain outcomes. Document units and overlap for every count.
- Account for activities after a failed batch; do not label them imported or silently omit them.
- Classify non-transient HTTP validation rejection separately from transport failure, and preserve earlier validation failures if a later batch fails.
- In dry-run, label accepted activities as validated rather than persisted; publish consistent summary semantics in all documentation.
- Test actual CLI exit codes and output with mocked/local services for empty, successful, validation-failed, partial, and multi-account runs.

### R04-03 — Make bootstrap repeatable and honor dry-run configuration

Priority: high. Bootstrap currently submits directly without reading existing activities and checks only the CLI dry-run flag.

Acceptance criteria:

- Read existing target-account activities and skip previously imported bootstrap entries before writing.
- Honor both DRY_RUN=true and --dry-run with documented precedence across bootstrap and normal sync.
- Repeating the same bootstrap file, including after a partial failure, adds zero duplicates.
- Define a stable bootstrap namespace/marker and a cutoff policy preventing overlapping opening positions and historical imports.
- Require explicit user-provided date and cost; never invent acquisition economics from a current holdings snapshot.
- Test bootstrap/history overlap, duplicate entries within a file, target-account isolation, partial recovery, and both dry-run mechanisms.

### R04-04 — Apply quota and date-range behavior to every PPI path

Priority: high. Follow-up to #10. Authentication and enrichment do not consistently retain the incomplete-history message; diagnostic history commands ignore configured dates.

Acceptance criteria:

- Authentication, movements, orders, and instrument enrichment classify HTTP 429 consistently, stop immediately, and report incomplete history with a nonzero exit.
- A failed initial PPI read produces no Ghostfolio writes; later failures preserve any prior-account progress in the report.
- --ppi-only and --ppi-orders use validated SYNC_FROM_DATE and inclusive SYNC_TO_DATE, including inverted-range rejection before requests.
- Respect provider reset/retry guidance without automatically probing PPI during a quota stop.
- Only recognize other exhausted-quota response shapes when supported by anonymized contract evidence; do not guess undocumented codes.
- Tests verify request counts, dates, exit behavior, and resumption without duplicates for authentication/read/enrichment failures.

### R04-05 — Make diagnostic output safe and auditable

Priority: high. Existing redaction and hashes reduce exposure but do not prove all error paths are safe.

Acceptance criteria:

- Sanitize nested errors and response details; tests inject tokens, authorization headers, account IDs, and private movement text and confirm none appear in logs.
- Failed/skipped identifiers are stable opaque references; document separately any private account identifier stored intentionally in Ghostfolio activity comments.
- Missing or malformed response comments still produce a safe, useful local activity reference.
- Warnings retain actionable type/reason information without dumping raw provider objects.
- Document safe support evidence and add a repository secret-check gate using synthetic test secrets only.

## v0.5.0 — Identity, accounts, and reconciliation

### R05-01 — Version fingerprints and prove upgrade compatibility

Priority: high. Depends on R04-01 and R04-03. Changes to balance discriminators or mapping identity must not reimport historical activities.

Acceptance criteria:

- Define and document canonical identity fields, fingerprint versioning, and legacy matching rules.
- Upgrade tests use representative pre-v0.3 comments and verify no reimport after migration.
- Verify distinct same-day movements remain distinct while repeated source snapshots remain duplicates.
- Cover simultaneous legacy differences, including absent order enrichment and absent balance discriminator.
- Define behavior when provider balances, mappings, or external IDs change; ambiguous legacy matches stop or warn rather than suppressing unrelated movements.
- Provide a migration procedure that does not delete or rewrite existing activities implicitly.

### R05-02 — Add account-aware symbol overrides and provider precedence

Priority: high.

Acceptance criteria:

- Allow overrides scoped by source account, currency, market, and ISIN where available, with documented precedence over global ticker rules.
- Reject conflicting equal-specificity overrides before importing.
- Preserve separate US, CEDEAR, and bond currency-species identities for overlapping ticker names.
- Verify configured MANUAL asset identities and supported provider values before a real write, using the available Ghostfolio contract.
- Test global fallback, account-specific override, ambiguity, and explicit provider selection.

### R05-03 — Verify multi-account isolation and recovery

Priority: high. Depends on R04-02 and R05-01.

Acceptance criteria:

- Identical external IDs/tickers across PPI accounts do not collide or cross target accounts.
- Existing activity checks consider the destination account, including a deliberate remapping scenario.
- The configured source-account list fails validation before writes begin when missing, duplicate, or invalid; no per-account Ghostfolio map is used.
- Failure in account two retains account-one results; resuming does not duplicate account one.
- Test and document the policy for multiple source accounts mapped into a single target account.
- Record an isolated integration result for two source accounts importing into the single configured target account, with private identifiers removed.

### R05-04 — Reconcile supported cash and investment activity end to end

Priority: high. Depends on all v0.4.0 fixes.

Acceptance criteria:

- Run the dedicated-account playbook for BUY, SELL, dividend, supported interest, tax/fee, deposit, and withdrawal examples.
- Validate real source examples for ARS, global USD, MEP, and CCL where available; synthetic seed acceptance alone is not source-mapping evidence.
- Reconcile dates, quantities, prices, fees, currencies, symbols, and cash buckets against expected results, not just record counts.
- Check that cash represented as MANUAL BUY/SELL does not silently double-count portfolio value or misrepresent expected performance; document its limitations.
- Verify the second normal import adds zero activities and a simulated partial import resumes without duplicates.
- Store only anonymized evidence with commit, configuration shape, expected/actual counts, and pass/fail status; missing samples remain explicitly unverified.

### R05-05 — Build a maintained contract-fixture corpus

Priority: medium.

Acceptance criteria:

- Each supported operation/response variant has an anonymized fixture, expected normalized result, and expected Ghostfolio payload.
- Record fixture provenance, observation date, relevant provider version, and anonymization method without personal values.
- Include nullable fields, decimal precision extremes, ambiguous identities, reversals, and documented error shapes.
- Run fixtures offline in CI; no test requires production credentials or consumes PPI quota.
- A schema change that drops or alters meaningful economics fails a regression test.

## v0.6.0 — Funds and financing

### R06-01 — Support FCI subscriptions and redemptions

Priority: feature scope. Depends on R05-01 and R05-05; source evidence required.

Acceptance criteria:

- Obtain anonymized subscription and redemption records with units, valuation, currency, dates, and charges.
- Define stable fund/share-class identity and a verified Ghostfolio representation.
- Preserve principal, proceeds, and units without inventing gains, fees, or prices.
- Handle reversals and ambiguous/incomplete rows explicitly; unsupported variants remain skipped.
- Cover normalization, payload validation, duplicate runs, and controlled test-account reconciliation before enabling the mapping.

### R06-02 — Support the cauciones lifecycle

Priority: feature scope. Depends on R05-05; source linkage evidence required.

Acceptance criteria:

- Obtain linked opening, maturity, and settlement examples separating principal, interest, and fees.
- Define direction and lifecycle identity, including supported lending/borrowing variants.
- Prevent principal return from being counted as income or duplicated as an unrelated deposit.
- Handle missing legs, partial settlement, cancellation, and reruns deterministically.
- Validate the Ghostfolio representation and complete a dedicated-account reconciliation; defer variants the target model cannot faithfully represent.

## v0.7.0 — Debt and corporate actions

### R07-01 — Support ONs and principal amortizations

Priority: feature scope. Depends on R05-02 and R05-05.

Acceptance criteria:

- Identify each debt species with verified symbol/ISIN/currency and explicit MANUAL mapping where required.
- Obtain purchase/sale, coupon, and principal-amortization fixtures.
- Separate interest income from principal repayment and adjust remaining holdings consistently with the instrument contract.
- Preserve applicable quotation/unit conventions; test them against expected economics.
- Validate duplicate runs, partial histories, and unsupported variants with explicit reasons.
- Complete a controlled Ghostfolio validation and reconcile holdings and cash effects.

### R07-02 — Support exchanges, splits, and reverse splits

Priority: feature scope. Depends on R05-01 and R05-05.

Acceptance criteria:

- Obtain complete corporate-action fixtures with affected identities, effective date, ratio, and cash/fractional treatment where applicable.
- Establish that Ghostfolio can represent the event without inventing trades, proceeds, or gains.
- Preserve economic ownership and cost treatment across the transformation; document any target-model limitations.
- Use a stable event identity and test reruns, partial records, reversals, and fractional entitlements.
- Keep events unsupported with actionable warnings when evidence or a faithful target representation is missing.

### R07-03 — Support cash mergers, delistings, and cash-in-lieu settlements

Priority: feature scope. Depends on R05-01, R05-05, and the cash-asset support delivered in v0.5.0.

Acceptance criteria:

- Obtain anonymized PPI fixtures for a cash merger or delisting that include the affected security, effective date, pre-event holding, broker settlement, taxes or fees, and any fractional-share treatment.
- Represent the retired security through a verified MANUAL asset when its market-data provider no longer supports its historical ticker; preserve its pre-event BUY, SELL, dividend, and fee history without creating a live quoted holding.
- Close the retired position using the broker-recorded cash settlement and import the settlement into the configured cash asset. Do not invent proceeds, gains, tax treatment, or a replacement security.
- Treat a cash merger as cash-only. For ATVI, the rule must record the 13 October 2023 effective date and $95.00 cash consideration per share, and must not create MSFT shares; a stock conversion is permitted only when the corporate-action evidence explicitly grants shares.
- Reconcile the post-event result: the retired position is zero, the cash effect matches the broker evidence, and no artificial contribution or withdrawal distorts Ghostfolio performance.
- Use a stable corporate-action identity and test duplicate runs, partial histories, already-settled positions, partial disposals before the event, fees/taxes, and fractional cash-in-lieu.
- Keep the event unsupported with an actionable warning when the broker settlement or a faithful Ghostfolio representation cannot be verified. No synthetic write may occur in that case.
- Complete a controlled Ghostfolio dry-run and a dedicated-account reconciliation before enabling the event for a live account.

## v0.8.0 — Commission completeness and scope freeze

### R08-01 — Resolve trade commission linkage

Priority: evidence-dependent. Continue historical issue #3 rather than duplicating it.

Acceptance criteria:

- Obtain an anonymized trade/commission pair sharing a stable operation, execution, order, or settlement reference.
- Require one unambiguous association; never infer a link from proximity or an amount residual alone.
- Import the charge exactly once, preserving non-negative fee representation and avoiding duplicate standalone charges.
- Test BUY/SELL association, multiple candidates, missing links, sign validation, and upgrade/rerun identity.
- If PPI cannot provide linkage, record the evidence and explicit scope deferral; retain unmatched-fee warnings and disclose incomplete cost/performance effects.
- Do not close the feature as implemented when only skip behavior is available.

### R08-02 — Freeze the v1.0 support contract and deferred backlog

Priority: mandatory.

Acceptance criteria:

- Publish a matrix of supported operations, currencies, markets, providers, account modes, and bootstrap scenarios with evidence links.
- Give every planned instrument issue a disposition: accepted, unresolved blocker, or explicitly deferred with reason and limitation.
- State whether v1.0 is the full original backlog or a narrower reliable core; record the scope decision before release-candidate work is declared complete.
- Disclose excluded commissions, unsupported currency labels, and automatic MEP/CCL conversion limits where applicable.
- Reconcile README, release notes, playbook, and historical roadmap entries so old notes cannot imply contradictory support.

## v0.9.0 — Release candidate preparation

### R09-01 — Run a release-candidate integration and failure campaign

Priority: mandatory. Depends on the scope freeze and all included features.

Acceptance criteria:

- Exercise the exact candidate commit against the support matrix in dedicated test accounts.
- Cover clean import, repeat import, uncertain response, middle-batch failure, validation rejection, PPI quota stop, and multi-account recovery.
- Use local fault injection for destructive/network-failure scenarios rather than exhausting provider quota deliberately.
- Capture actual process exit codes, reconciled totals, and zero-duplicate evidence.
- Record tested Bun and Ghostfolio versions; unsupported/unverified combinations are clearly identified.
- Resolve every critical/high correctness finding and rerun affected scenarios before approval.

### R09-02 — Verify reproducible container publication and upgrades

Priority: mandatory.

Acceptance criteria:

- Build from the committed lockfile and verify the image runs as a non-root user with the intended CLI entrypoint.
- Confirm the image excludes credentials and private artifacts.
- Verify CI typecheck, lint, tests, and version/tag consistency on the candidate commit.
- Publish and pull a candidate image through the existing workflow; record its digest and smoke-test the pulled artifact.
- Test an upgrade from the last supported release with existing fingerprints and document operational rollback limits.
- Do not treat the presence of a publishing workflow as proof that a particular image was successfully published.

### R09-03 — Complete operator documentation and maintenance checks

Priority: mandatory.

Acceptance criteria:

- Document installation, configuration precedence, account isolation, dates, dry-run semantics, bootstrap cutoff, retries, and quota recovery.
- Provide troubleshooting that uses safe references and never requests raw credentials/responses.
- Explain external scheduling and prevent overlapping runs through a documented or implemented concurrency policy.
- Review dependencies and secret handling; triage findings and resolve release-blocking issues.
- Verify examples and links against the candidate CLI and current configuration parser.

## v1.0.0 — Stable release

### R10-01 — Approve and publish the stable release

Priority: mandatory. Depends on R09-01 through R09-03.

Acceptance criteria:

- All mandatory issues are accepted; each feature-scope issue is accepted or explicitly deferred in the support contract.
- No unresolved critical/high issue threatens duplicate prevention, monetary correctness, data isolation, or truthful completion reporting.
- Recheck integration evidence against the exact release commit; changes after candidate validation receive proportionate revalidation.
- Set package version to 1.0.0 and synchronize any other version-bearing build/CI metadata that exists; finalize changelog and release notes.
- Confirm the release branch is integrated as intended, create the approved tag, and verify the publication workflow succeeds.
- Verify the published image digest, release notes, upgrade instructions, and supported-operation matrix are accessible and consistent.
- Archive sanitized release evidence and retain deferred issues as open backlog rather than silently dropping them.

## Issue-management and evidence rules

For each GitHub issue, include the planning ID, milestone, priority, dependencies, acceptance criteria, and evidence required for closure. Suggested labels: bug, reliability, mapping, documentation, integration, and blocked-by-provider-evidence.

Passing unit tests alone does not close an integration requirement. An observed failure followed by a count-only assertion does not prove successful recovery. A fingerprint being generated does not prove duplicate prevention unless the import path actually checks it or the server enforces it.

For each acceptance criterion, link a test, anonymized fixture, reviewed document, or reproducible integration result. Keep credentials, private IDs, and raw responses out of commits and issue bodies. Respect PPI quota stops and use mocks for repeated development checks.

This document adds planning only. It does not bump the current package from v0.3.0, change runtime behavior, or authorize automatic publication of future milestones.
