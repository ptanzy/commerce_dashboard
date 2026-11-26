/* WU-10 Phase 3B — optional, local-only DevTools Snippet (not loaded by dashboard).
 * Measures click-to-second-animation-frame proxy; NOT confirmed visual paint time.
 * Groups known controls using fixed labels. Does not record DOM text, input values,
 * element IDs, state/flow identifiers, URLs or filter selections. No network calls.
 * Run from DevTools > Sources > Snippets; then wu10Probe.report().
 */
(() => {
  if (window.wu10Probe && typeof window.wu10Probe.stop === 'function') window.wu10Probe.stop();

  const MAX_SAMPLES = 300;
  const MAX_LONG_TASKS = 600;
  const samples = [];
  const longTasks = [];
  let totalSamples = 0;
  let totalLongTasks = 0;
  let firstHeapMiB = heap();
  let running = true;

  function heap() {
    const bytes = performance.memory?.usedJSHeapSize;
    return Number.isFinite(bytes) ? Math.round(bytes / 1048576) : null;
  }
  const round = n => Math.round(n * 10) / 10;
  const groupNumber = (target, parentSelector) => {
    const parent = target.closest(parentSelector);
    if (!parent) return null;
    return Array.prototype.indexOf.call(parent.querySelectorAll('button'), target);
  };
  const fixedIndex = (target, parentSelector, labels) => {
    const index = groupNumber(target, parentSelector);
    return index !== null && index >= 0 && index < labels.length ? labels[index] : 'other';
  };
  const filterGroup = target => {
    const group = target.closest('.multi-filter-field');
    if (!group) return 'other';
    const index = Array.prototype.indexOf.call(document.querySelectorAll('.multi-filter-field'), group);
    return ['seller-origins', 'customer-destinations', 'product-categories'][index] || 'other';
  };
  function identify(target) {
    // Do not store or log user-controlled attributes, DOM text or data values.
    if (target.matches('path.sankey-ribbon-hit')) return ['sankey-flow', 'sankey.ribbon'];
    if (target.matches('path.brazil-region')) return ['map-region', 'map.region'];
    if (target.matches('rect.trend-hit')) return ['trend-bar', 'trend.bar'];
    if (target.matches('input[type="checkbox"]')) return ['checkbox', `filter.checkbox.${filterGroup(target)}`];
    if (target.matches('summary')) return ['menu', `filter.menu.${filterGroup(target)}`];
    if (target.matches('.flow-choice')) return ['button', 'sankey.flow-list'];
    if (target.matches('.state-option')) return ['button', 'map.state-list'];
    if (target.closest('.sankey-measure-controls')) return ['button', `sankey.metric.${fixedIndex(target, '.sankey-measure-controls', ['item-count','freight-charged','item-value'])}`];
    if (target.closest('.map-measure-controls')) return ['button', `map.metric.${fixedIndex(target, '.map-measure-controls', ['order-volume','on-time-rate','median-delivery'])}`];
    if (target.closest('[role="group"][aria-label="Map geography view"]')) return ['button', `map.view.${fixedIndex(target, '[role="group"][aria-label="Map geography view"]', ['seller-origins','destinations'])}`];
    if (target.closest('[role="group"][aria-label="Monthly trend metric"]')) return ['button', `trends.metric.${fixedIndex(target, '[role="group"][aria-label="Monthly trend metric"]', ['order-volume','on-time-rate'])}`];
    if (target.closest('[role="group"][aria-label="Category ranking measurement"]')) return ['button', `category.metric.${fixedIndex(target, '[role="group"][aria-label="Category ranking measurement"]', ['orders','item-value','freight','on-time-rate'])}`];
    if (target.matches('.filter-chip')) return ['button', 'filter.remove-chip'];
    if (target.matches('.reset-button')) return ['button', 'filter.reset-all'];
    if (target.closest('.multi-filter-toolbar')) return ['button', `filter.clear-group.${filterGroup(target)}`];
    if (target.matches('.viz-clear')) return ['button', 'chart.clear-selection'];
    if (target.closest('.sankey-focus-chips')) return ['button', 'sankey.remove-focused-flow'];
    if (target.closest('.sankey-focus-details')) return ['button', 'sankey.clear-focus'];
    if (target.matches('.theme-toggle')) return ['button', 'app.theme-toggle'];
    if (target.closest('.saved-controls')) return ['button', 'saved-views.action'];
    if (target.closest('.page-controls')) return ['button', 'orders.pagination'];
    if (target.matches('.order-view-button')) return ['button', 'orders.open-details'];
    if (target.matches('.order-sort')) return ['button', 'orders.sort'];
    if (target.matches('a')) return ['link', 'navigation.link'];
    return ['button', 'other.button'];
  }
  const CLICKABLE = 'button,input[type="checkbox"],summary,[role="button"],[role="checkbox"],a,path.brazil-region,rect.trend-hit';
  function record(event) {
    if (!running || !(event.target instanceof Element)) return;
    const target = event.target.closest(CLICKABLE);
    if (!target) return;
    const [role, control] = identify(target);
    const started = performance.now();
    // Store only static category and timing; never hold a DOM node reference.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!running) return;
      const finished = performance.now();
      totalSamples++;
      if (samples.length >= MAX_SAMPLES) samples.shift();
      samples.push({ role, control, ms: round(finished - started), started, finished });
    }));
  }
  function recordSvgKeyboard(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target instanceof Element && event.target.matches('path.sankey-ribbon-hit')) record(event);
  }
  let observer = null;
  const supportsLongTask = typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes?.includes('longtask');
  if (supportsLongTask) {
    try {
      observer = new PerformanceObserver(list => {
        if (!running) return;
        for (const entry of list.getEntries()) {
          totalLongTasks++;
          if (longTasks.length >= MAX_LONG_TASKS) longTasks.shift();
          longTasks.push({ started: entry.startTime, finished: entry.startTime + entry.duration, ms: round(entry.duration) });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch { observer = null; }
  }
  document.addEventListener('click', record, true);
  document.addEventListener('keydown', recordSvgKeyboard, true);

  function percentile(values, fraction) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
  }
  function timings(values) {
    return { count: values.length, medianMs: percentile(values, 0.5),
      p95Ms: percentile(values, 0.95), maxMs: values.length ? Math.max(...values) : null };
  }
  function summarize(key) {
    const grouped = {};
    for (const sample of samples) (grouped[sample[key]] ||= []).push(sample.ms);
    return Object.fromEntries(Object.entries(grouped)
      .map(([label, values]) => [label, timings(values)])
      .sort((a, b) => (b[1].p95Ms ?? 0) - (a[1].p95Ms ?? 0)));
  }
  const overlapMs = (a, b) => Math.max(0, Math.min(a.finished, b.finished) - Math.max(a.started, b.started));
  function taskContext(sample) {
    // Exact overlap is temporal, NOT proof that a task caused the delay.
    const overlapping = longTasks.filter(task => overlapMs(sample, task) > 0);
    // Useful for deferred computations scheduled after an apparently fast click.
    const subsequent = longTasks.filter(task => task.started >= sample.started && task.started < sample.started + 1000);
    return {
      overlappingLongTasks: overlapping.length,
      overlappedLongTaskMs: round(overlapping.reduce((sum, task) => sum + overlapMs(sample, task), 0)),
      largestOverlappingTaskMs: overlapping.length ? Math.max(...overlapping.map(t => t.ms)) : null,
      subsequentLongTasks1s: subsequent.length,
    };
  }
  window.wu10Probe = {
    report() {
      const byControl = summarize('control');
      const byRole = summarize('role');
      const slowest = [...samples].sort((a,b) => b.ms - a.ms).slice(0, 12).map(sample => ({
        role: sample.role, control: sample.control, proxyMs: sample.ms, ...taskContext(sample),
      }));
      const longestTasks = [...longTasks].sort((a,b) => b.ms - a.ms).slice(0, 10).map(task => ({
        durationMs: task.ms,
        // Most recent sampled click within 1s before task start; may be unrelated.
        precedingControl: [...samples].reverse().find(sample => sample.started <= task.started && task.started - sample.started <= 1000)?.control || 'none/unknown',
      }));
      const result = {
        samples: samples.length, totalSamples,
        byRole, byControl, slowest,
        longTaskCount: longTasks.length, totalLongTasks,
        longestTaskMs: longTasks.length ? Math.max(...longTasks.map(t=>t.ms)) : null,
        longestTasks,
        initialHeapMiB: firstHeapMiB, finalHeapMiB: heap(),
        note: 'Two-rAF time is only a scheduling proxy, not actual visual highlight latency. Long-task proximity is correlation, not causation. Use DevTools Performance screenshots to confirm paint.',
      };
      console.log('WU-10 grouped by control (slowest P95 first):');
      console.table(byControl);
      console.log('WU-10 slowest individual interactions:');
      console.table(slowest);
      console.log('WU-10 longest main-thread tasks (approximate preceding controls):');
      console.table(longestTasks);
      console.log('WU-10 local-only report:', result);
      return result;
    },
    reset() {
      samples.length = 0;
      longTasks.length = 0;
      totalSamples = 0;
      totalLongTasks = 0;
      firstHeapMiB = heap();
      console.log('WU-10 probe cleared; recording continues.');
    },
    stop() {
      running = false;
      document.removeEventListener('click', record, true);
      document.removeEventListener('keydown', recordSvgKeyboard, true);
      observer?.disconnect();
      delete window.wu10Probe;
    },
  };
  console.log('WU-10 probe v2 active. Interact normally, then call wu10Probe.report(). Use reset() to start a new run, stop() to remove.');
})();
