/** Serial sampling with cancellation across focus/background changes. */
export function createNativeScanLoop<T>(options: {
  sample: (signal: AbortSignal) => Promise<T>;
  /** Returning false ends sampling after this frame has been delivered. */
  onResult: (value: T) => unknown;
  onError: (error: unknown) => void;
  onBusy: (busy: boolean) => void;
  intervalMs?: number;
  timeoutMs?: number;
}) {
  let enabled = false, generation = 0;
  let pending: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interval = options.intervalMs ?? 3000;

  function schedule(delay: number) {
    if (!enabled || pending || timer !== undefined) return;
    timer = setTimeout(() => { timer = undefined; void run(); }, delay);
  }
  async function run() {
    if (!enabled || pending) return;
    const token = generation, request = new AbortController();
    pending = request;
    options.onBusy(true);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      request.abort();
      if (enabled && generation === token) {
        enabled = false;
        options.onBusy(false);
        options.onError(new Error('Artwork scanning timed out. Please try again.'));
      }
      // Keep pending locked until native capture / compression actually settles.
    }, options.timeoutMs ?? 45000);
    try {
      const value = await options.sample(request.signal);
      if (enabled && generation === token) {
        if (timedOut) throw new Error('Artwork scanning timed out. Please try again.');
        if (!request.signal.aborted && options.onResult(value) === false) enabled = false;
      }
    } catch (error) {
      if (enabled && generation === token) {
        enabled = false;
        options.onError(timedOut ? new Error('Artwork scanning timed out. Please try again.') : error);
      }
    } finally {
      clearTimeout(timeout);
      pending = null;
      if (generation === token) options.onBusy(false);
      // A resumed session waits for an older aborted operation to settle too.
      schedule(interval);
    }
  }
  return {
    start() { if (enabled) return; enabled = true; generation++; schedule(400); },
    stop() {
      enabled = false; generation++;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending?.abort();
      options.onBusy(false);
    },
  };
}
