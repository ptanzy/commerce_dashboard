# WU-10 Phase 3 — Atomic ETL publication and browser performance gate

## Scope and implementation

- ETL now serializes the three dataset JSONs into an isolated, immutable `public/data/generations/<32-hex-generation>/` folder and writes `public/data/current.json` **last** with atomic per-file replacement. The pointer is the commit record. If a run fails before that step, the loader continues reading the previous generation. An abrupt power loss may leave `.stage-*` or an unreferenced generation, but neither is published.
- At startup, the browser loads `current.json` and resolves all three data assets under the **same** generation. An invalid pointer or a missing published asset is an error, never a fallback. When `current.json` returns **404 only**, the loader supports legacy `public/data/{orders,items,metadata}.json`.
- Generated source-data assets remain untracked. Do not commit `public/data/` or derived row records. Previous generation directories are deliberately retained for existing browser tabs; do not automatically prune them during active usage. Old unreferenced directories can be manually cleaned **only after** closing tabs and taking backups.
- Existing domain benchmarks and optional acceptance scripts now honor the pointer. A new local-only DevTools snippet measures coarse click-to-two-animation-frame proxy and long tasks without recording filter values. The snippet is **not loaded by the application**.

## Limitations (do not overclaim)

- The pointer publishes one consistent immutable generation, but does not provide database-grade concurrent-writer locking, crash-durable `fsync`, or cryptographic verification of HTTP response contents. Pointer SHA-256 values are ETL output metadata, not yet independently validated in the browser. Avoid concurrently running two ETL jobs into the same output directory.
- Legacy **flat** datasets still have the old cross-file interruption risk until the first new ETL run publishes `current.json`. The WU-10 patch itself does not require rerunning ETL; existing flat data still loads.
- The browser probe reports a latency proxy only. Real click-to-visible-selection and memory-leak assertions require Chrome/Edge Performance and Memory inspection on the user's full dataset. No browser measurements were performed in this environment.

## Local validation

```powershell
npm run typecheck
npm test
npm run test:node
python -m unittest discover -s tests -p 'test_*.py' -v
npm run security:static
npm run build
npm run bench:wu10
```

To exercise atomic publication, run the normal Python ETL (on a copy or backed-up local output), then inspect `public/data/current.json`, verify its referenced `generations/<id>/` contains all three complete JSON files, and reload the browser. The old flat files may remain present from earlier ETL runs, but are ignored once `current.json` exists. **Never delete the referenced generation.**

## Browser acceptance (full 99,441-order dataset)

1. Open DevTools > Sources > Snippets, add the contents of `scripts/wu10_browser_probe.js`, and run it. In the Console use `wu10Probe.report()` after testing; `wu10Probe.stop()` disables it. The probe is optional and captures only generic control types, bounded timing samples, and heap snapshots. It does not submit data anywhere.
2. In Edge/Chrome DevTools Performance, record five rapid checkbox changes, Sankey flow selections/Ctrl+clicks, and all three Sankey metric tabs, with Screenshots enabled. Check **actual** click-to-visible state (target <=250 ms). The snippet's two-frame latency is not a substitute for measuring paint.
3. Run the above interactions 30–50 times, switching maps, tabs, saved views, and filters. Compare Performance long tasks, average click latency, and heap snapshots before and after returning to baseline. Some memory growth from caches/JIT is normal; investigate sustained retained growth after GC rather than assuming any growth is a leak.
4. Repeat in dark and light themes, narrow viewport and desktop. Confirm no incorrect selected state, stale Sankey label, missed Ctrl+click selection, blank maps, or unexpected loading jank.
5. If you regenerate assets, reload the app, verify all KPIs and datasets reconcile, and ensure unsuccessful ETL runs leave the previously published generation selected. Deliberately inject filesystem failures only in a disposable directory using automated Python tests—not the user's real dataset directory.

**Gate:** Do not mark browser 250 ms or long-term heap stability passed until measured locally. Report actual P50/P95, screenshots or browser observations, and any significant regressions. No commit until acceptance.
