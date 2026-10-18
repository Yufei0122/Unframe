import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
try { loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const [mode, ...args] = process.argv.slice(2);
const python = process.env.PYTHON_EXE || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const scripts = { train: 'train_met.py', query: 'query_met.py', compare: 'compare_met_openclip.py', fullframe: 'evaluate_met_fullframe.py' };
if (!scripts[mode] && mode !== 'test') throw new Error('Choose train, query, compare, fullframe or test.');
if (!existsSync(python)) throw new Error('Python environment is missing. Run ai:setup, or set PYTHON_EXE to a Python with torch, torchvision, Pillow and numpy.');
const command = mode === 'test' ? ['-m', 'unittest', 'discover', '-s', 'local-ai', '-p', 'test_met_training.py', '-v', ...args]
  : ['-u', path.join(root, 'local-ai', scripts[mode]), ...args];
const child = spawn(python, command, { cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, TORCH_HOME: process.env.TORCH_HOME || path.join(root, '.local-ai', 'cache', 'torch') } });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
