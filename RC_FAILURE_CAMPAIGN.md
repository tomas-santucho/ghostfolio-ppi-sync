# RC failure campaign — v1.0.0-rc.1

Candidate: `08d1ef6` (`v1.0.0-rc.1`). The code-bearing candidate is unchanged
by subsequent evidence-only commits. Tests use local fault injection and
synthetic fixtures; no PPI quota was consumed and no production connection was
intentionally broken.

## Environment

- Bun: `1.3.2`
- Ghostfolio target: frontend-reported `2024.11.0`
- Candidate publication: GitHub Actions run `34652129445`, successful.
- Test account history evidence: `v1-reconciliation-evidence.md`.

## Results

| Scenario | Expected exit | Actual exit / result | Expected state | Actual state | Duplicates created | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Clean controlled import | 0 | 0 | Valid activities persist once | 90 historical candidates persisted | No | PASS |
| Repeat import | 0 | 0 | All prior activities classify as duplicates | `Imported=0`, `Duplicates=181` | No | PASS |
| Uncertain persistence | Nonzero | Nonzero-worthy summary, fixture passes | Reconcile before retry; stop if not provable | Persisted rows not resent; unreconciled result stops | No | PASS |
| Partial persistence | Recovery succeeds | Fixture passes | Retry only known missing rows | Only missing rows are resent | No | PASS |
| Middle-batch failure | Nonzero | Nonzero-worthy summary, fixture passes | Preserve completed range and report remainder | Completed batches retained; remaining rows unattempted | No | PASS |
| Ghostfolio validation rejection | Nonzero | CLI fixture exits nonzero | Reject the row without losing valid work | Validation failure isolated and reported | No | PASS |
| PPI HTTP 429 | Nonzero | CLI fixture exits nonzero | Stop immediately before Ghostfolio writes | Incomplete history; no Ghostfolio access | No | PASS |
| PPI/Ghostfolio 401 then reauth | 0 after one refresh | Client fixtures pass | One token refresh and retry | Second 401 stops; no refresh loop | No | PASS |
| Multi-account recovery | Nonzero when one account fails | Fixture passes | Retain earlier totals and continue later source when safe | Account-local validation failure does not suppress later source | No | PASS |
| Concurrent-start rejection | Second process nonzero | Lock fixture passes | First holder keeps lock; second fails closed | Fresh foreign-host lock rejected | No | PASS |
| Unsupported operation | 0 when remaining batch is valid | Fixture passes | Skip with deterministic reason and continue | Unsupported categories do not become validation failures | No | PASS |

## Test evidence

The full candidate suite completed with `144 pass`, `0 fail`, and `471`
expectations. It covers the listed scenarios in `tests/ghostfolio.test.ts`,
`tests/sync.test.ts`, `tests/ppi.test.ts`, `tests/cli.test.ts`, and
`tests/run-lock.test.ts`. `bun run typecheck`, `bun run lint`, and `bun run
secrets` also passed.

The real controlled campaign imported 90 activities, then verified a full
duplicate-free rerun. Cash reconciliation is intentionally not asserted here:
it is deferred post-v1 and outside the stable support contract.
