import sys, time, pathlib, ctypes
sys.path.insert(0, '/app/local-ai')
from model import load_encoder
def stats():
    status = pathlib.Path('/proc/self/status').read_text()
    return '\n'.join(line for line in status.splitlines() if line.startswith(('VmRSS:', 'RssAnon:', 'RssFile:', 'VmHWM:')))
start = time.monotonic()
embed, identity = load_encoder()
print('loaded_seconds', time.monotonic() - start, flush=True)
print('before', stats(), flush=True)
print('trim', ctypes.CDLL(None).malloc_trim(0), flush=True)
print('after', stats(), flush=True)
