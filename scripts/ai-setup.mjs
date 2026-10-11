import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ensureOllama, installShutdown, pullOllamaModel, python, root, run, stopOwned } from './ai-runtime.mjs';

installShutdown();
const errors = [];
async function stage(label, action) {
  try { console.log(`\n${label}`); await action(); return true; }
  catch (error) { errors.push(`${label}: ${error.message}`); console.error(errors.at(-1)); return false; }
}

function systemPython() {
  const choices = process.env.PYTHON_EXE ? [[process.env.PYTHON_EXE, []]] : process.platform === 'win32' ? [['py', ['-3.12']], ['python', []], ['py', ['-3']]] : [['python3', []], ['python', []]];
  for (const [command, prefix] of choices) {
    const check = spawnSync(command, [...prefix, '-c', 'import sys; raise SystemExit(0 if (3,10) <= sys.version_info[:2] <= (3,13) else 1)'], { windowsHide: true, stdio: 'ignore' });
    if (check.status === 0) return { command, prefix };
  }
  throw new Error('Install Python 3.10-3.13 (3.12 recommended), or set PYTHON_EXE to its python.exe. No administrator shell or virtual-environment activation is needed.');
}

try {
  const installed = await stage('Install local Python environment and CPU dependencies', async () => {
    await mkdir(path.join(root, '.local-ai'), { recursive: true });
    // Keep package caches beside the environment, including in restricted shells.
    process.env.PIP_CACHE_DIR ||= path.join(root, '.local-ai', 'pip-cache');
    if (!existsSync(python)) {
      const { command, prefix } = systemPython();
      await run(command, [...prefix, '-m', 'venv', path.join(root, '.venv')]);
    }
    await run(python, ['-m', 'pip', 'install', '--upgrade', 'pip']);
    await run(python, ['-m', 'pip', 'install', 'torch==2.8.0', 'torchvision==0.23.0', '--index-url', 'https://download.pytorch.org/whl/cpu']);
    await run(python, ['-m', 'pip', 'install', '-r', path.join(root, 'local-ai', 'requirements.txt')]);
    await run(python, ['-m', 'pip', 'check']);
  });
  if (installed) await stage('Download and verify OpenCLIP weights', () => run(python, ['-u', path.join(root, 'local-ai', 'download.py')]));
  // An OpenCLIP download failure must not prevent the independent Ollama setup.
  await stage('Prepare Ollama Qwen3 4B', async () => { await ensureOllama(); await pullOllamaModel(); });
  if (errors.length) { console.error(`\nSetup incomplete (${errors.length} failed stage(s)). Rerun ai:setup after correcting the errors; downloaded files and existing models are reused.`); process.exitCode = 1; }
  else console.log('\nLocal models are installed. Run npm.cmd run ai:up, then npm.cmd run ai:doctor -- --smoke.');
} finally { await stopOwned(); }
