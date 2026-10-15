import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
// Some managed build containers do not expose OS RSS statistics.
// Skip only Next.js's optional memory trace in that environment; compilation,
// type checks, prerendering and export still run without suppression.
try {
  process.memoryUsage();
} catch (error) {
  if (error.code !== 'ENOENT' || error.syscall !== 'uv_resident_set_memory') throw error;
  const path = require.resolve('next/dist/lib/memory/trace.js');
  const text = fs.readFileSync(path, 'utf8');
  const needle = 'const memoryUsage = process.memoryUsage();';
  if (text.includes(needle)) {
    fs.writeFileSync(path, text.replace(needle, `let memoryUsage;
    try { memoryUsage = process.memoryUsage(); }
    catch (error) {
      if (error.code === 'ENOENT' && error.syscall === 'uv_resident_set_memory') return;
      throw error;
    }`));
  }
  console.warn('Build environment: OS RSS metrics unavailable; optional memory tracing skipped.');
}
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build', '--webpack'], { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
