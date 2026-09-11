# Operator and maintenance sweep — v1.0.0-rc.1

Date: 2026-09-11. Candidate runtime commit: `08d1ef6`.

## Documentation consistency

Reviewed `README.md`, `.env.example`, `docker-compose.example.yml`,
`integration-playbook.md`, `ppi.md`, and the CLI implementation.

| Area | Result |
| --- | --- |
| Installation and configuration | PASS — `.env` is local-only; explicit process variables override it; Compose sets the shared lock path. |
| Date ranges and dry-run | PASS — inclusive `SYNC_TO_DATE` and controlled dry-run are documented and validated. |
| Bootstrap | PASS — file plus cutoff are required; a dry-run with the fixture validated one holding and persisted nothing. |
| 401 and 429 | PASS — one-refresh-only and no-retry rate-limit behavior agree between code, tests, and operating guide. |
| Uncertain/partial recovery | PASS — batch range, unattempted, uncertain, and rerun guidance agree with fault-injection tests. |
| Shared locking | PASS — Compose uses the named `ppi-sync-lock` volume and a fixed `SYNC_LOCK_PATH`; server validation is recorded in RC evidence. |
| Cash boundary | PASS — disabled by default and described as experimental/outside v1. |

## Command and dependency checks

- `bun --version`: `1.3.2`.
- `bun audit`: no vulnerabilities found.
- `docker compose -f docker-compose.example.yml config`: valid configuration.
- `bun run sync --help`: all documented CLI modes listed.
- `bun run sync --ghostfolio-only`: successful read-only connectivity check.
- `bun run sync --ghostfolio-import-dry-run`: one synthetic activity validated with no persistence.
- `bun run sync --bootstrap-holdings --dry-run` with an explicit fixture and cutoff: one holding validated, zero duplicates.
- PPI diagnostics were not reissued during this sweep to preserve quota. Their bounded read-only behavior, 429 handling, multi-account behavior, and exact commands are covered by the offline suite and prior controlled evidence.
- `bun run typecheck`, `bun test`, `bun run lint`, and `bun run secrets`: all passed; the suite has 144 passing tests.

No runtime files differ from the candidate commit. Subsequent commits contain only
release evidence and documentation.
