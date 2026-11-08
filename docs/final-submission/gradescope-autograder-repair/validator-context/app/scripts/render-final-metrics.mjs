// AWS-rendered metric graphs from actual workload time windows, not synthetic plots.
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile), dir = 'verification/2026-10-31/recognition-final';
const observed = JSON.parse(await readFile(`${dir}/F14-F16-observations.json`, 'utf8'));
const dashboard = JSON.parse(JSON.parse(await readFile(`${dir}/before-dashboard.json`, 'utf8')).DashboardBody);
const snapshots = [];
for (const [index, widget] of dashboard.widgets.entries()) {
  if (!widget.properties?.metrics) continue;
  const input = { ...widget.properties, width: 1000, height: 380, start: new Date(Date.parse(observed.startedAt)-120000).toISOString(), end: new Date().toISOString(), timezone: '+1000' };
  delete input.liveData;
  await writeFile(`${dir}/F20-widget-${index}.json`, JSON.stringify(input));
  try {
    const { stdout } = await exec('aws', ['cloudwatch', 'get-metric-widget-image', '--metric-widget', `file://${dir}/F20-widget-${index}.json`, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, maxBuffer: 4*1024*1024, timeout: 60000 });
    const result = JSON.parse(stdout); await writeFile(`${dir}/F20-widget-${index}.png`, Buffer.from(result.MetricWidgetImage, 'base64'));
    snapshots.push({ widget: index, status: 'PASS', metrics: input.metrics.map(m=>m[1]) });
  } catch (error) { snapshots.push({ widget: index, status: error.stderr?.match(/An error occurred \(([^)]+)\)/)?.[1] || 'FAILED' }); }
}
await writeFile(`${dir}/F20-graphs.json`, JSON.stringify(snapshots, null, 2));
console.log(JSON.stringify(snapshots));
