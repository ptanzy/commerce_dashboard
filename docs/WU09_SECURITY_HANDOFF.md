# WU-09 — Security & Adversarial Testing (implementation handoff)

**Baseline:** `feature/dashboard-poc` at `4cc822407df9936e08cb792d68b900ccea536269` (accepted WU-08). This is an **additive patch, not a commit**. Keep final project documentation for WU-N.

## Scope and threat model

The application is a **local-only React/Vite dashboard**, using generated Olist JSON files, a browser-only saved-view store, CSV downloads, and Python/DuckDB ETL. There are no authenticated users, hosted API, payments, or application SQL endpoints. Treat input ZIP/CSVs, browser storage, generated datasets, and any labels displayed/exported as potentially untrusted. Do not expose real Olist-derived row-level data in public Git history. We are testing local misuse and malformed inputs, not pretending to test a non-existent network server.

Threat / intended control:

| Attack path | Protection and test |
|---|---|
| Path traversal / duplicate ZIP names | Extract **only six named CSVs** to a new temporary directory; duplicate basenames rejected; synthetic traversal case |
| ZIP bombs / resource exhaustion | Bound archive size (512 MiB), archive entries (10,000), selected CSV size (128 MiB each), required total (384 MiB), compression ratio (200:1), and **actual streamed decompressed bytes**; test rejects attacks |
| ZIP symlink / encrypted or unhandled compression | Reject unsafe entries and unsupported methods; test linked entry |
| Local directory input bypass | Reject symlinked and oversized required input files; test symlink |
| Spreadsheet formula injection | Prefix text cells with apostrophe when dangerous formula characters follow whitespace/BOM; replace embedded control and bidi characters; quote/escape CSV; synthetic tests |
| Browser storage tampering | Strict validation of filter snapshots and saved views, disallow spoofing controls in names/categories, bounded saved-view storage read; negative tests |
| XSS | React's default escaping; dedicated saved-view UI regression test; offline scan flags raw HTML sinks and dynamic evaluation |
| Logs / incident report leakage | Existing fixed-code/allowlisted logging; regression verifies diagnostic report remains redacted |
| Secrets and accidentally tracked data | Offline source guardrail flags likely hardcoded secrets, dangerous APIs, tracked `data/raw/`, tracked `public/data/`, and key files |

No external monitoring, scripts, automatic repairs, or telemetry were added. WU-07 filter and Sankey behavior is unchanged.

## Commands — Windows PowerShell

From repo root after extracting this patch:

```powershell
npm run typecheck
npm test
npm run test:node
npm run test:security
python -m unittest discover -s tests -p 'test_*.py' -v
npm run security:static
npm run build
```

### Dependency advisories — mandatory manual gate

In a network-connected developer environment, run and **review both**:

```powershell
npm audit --omit=dev
npm audit
python -m pip list --format=freeze
```

The `security:deps` npm script is a shortcut for the production-only npm audit. `npm audit` also covers development tooling, which matters because Vite and Vitest run locally. Record package, advisory, affected versions, whether exploitability is reachable, and recommended upgrade. **Do not use `npm audit fix --force` blindly**. Do not claim advisories are resolved unless a fresh audit confirms it. Python dependency review should verify the installed DuckDB version against a vulnerability database; `pip list` alone does not scan for vulnerabilities. An optional local `pip-audit` tool may be used when explicitly installed.

### Manual browser adversarial exercises — required before accepting WU-09

1. In Edge/Chrome, open the dashboard with only `127.0.0.1` and DevTools. Verify it has no application requests to unapproved external hosts; Vite's own dev tooling may make local websocket requests.
2. Save a view named `<img src=x onerror=alert(1)>`. The name should display as literal text; **no image/script node should be executed**. Remove it after testing.
3. In a disposable browser profile or cleared test storage, alter `commerce-dashboard:wu07-filter-views:v1` with invalid filters, control characters, huge strings, and `__proto__` keys. App should not crash or execute injected content. **Do not replace a real profile's saved views**.
4. Generate a CSV using the synthetic Node test suite and check the formula-looking IDs appear as text in a spreadsheet program; quoted data must not create extra rows. Note: spreadsheet behaviors vary, especially on save/reopen.
5. Block `brazil-states.topojson` with DevTools and reload. Recovery Center should show a local asset failure, not expose paths or source records; an attempted retry should have a bounded failure outcome and a developer-report hypothesis. Unblock and retry, confirming recovery.
6. Inspect browser Console/Network for unexpected external requests, unsafe CSP behavior, sensitive logging, or report leaks. Review any exported support bundle before sharing.
7. Test on a second browser to check escaping and CSV handling, and verify no regression in legitimate filters, metrics, CSV, and saved views.

**OWASP references:** [ASVS 5.0](https://asvs.owasp.org/), [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection), [Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/).

## Executed checks in the patch-construction environment

- Offline Python adversarial ZIP/source scanner: **10/10 passed**.
- Existing and new Python tests: **19 passed; 1 DuckDB integration skipped** (DuckDB not installed here).
- Compiled Node domain/observability/adversarial suite: **79/79 passed**.
- Real Olist ZIP safe extraction and required CSV header validation: **passed** (6 required CSVs; ~44.7 MB total uncompressed); this is extraction-only, no derived data included.
- Source guardrail: **passed, source-only fallback**, because this build folder is not a Git working tree. Re-run in your actual repository to get tracked-file verification.
- Full React/Vitest suite, TypeScript application build, cross-browser checks, dependency audit, browser security testing: **not performed here**. These must be reported after the local acceptance run.

The scanner is a narrowly scoped **guardrail**, not a professional SAST scanner or penetration-test substitute. Automated tests increase confidence but do not certify absence of vulnerabilities. Treat any additional security findings from later WUs as new work, and rerun security tests after WU-12 feature changes.
