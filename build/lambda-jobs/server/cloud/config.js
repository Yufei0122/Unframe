export function readCloudConfig(env = process.env, { worker = false } = {}) {
  const required = key => { if (!env[key]?.trim()) throw new Error(`${key} is required`); return env[key].trim(); };
  const integer = (key, fallback, min, max) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${key}`);
    return n;
  };
  const prefix = env.JOB_IMAGE_PREFIX || 'uploads/';
  if (!/^[a-zA-Z0-9/_-]+\/$/.test(prefix) || prefix.startsWith('/')) throw new Error('JOB_IMAGE_PREFIX must be a relative S3 prefix ending in /');
  const config = { region: env.AWS_REGION || 'ap-southeast-2', tableName: required('JOBS_TABLE_NAME'), bucket: required('JOB_IMAGES_BUCKET'), prefix,
    uploadSeconds: integer('JOB_UPLOAD_TTL_SECONDS', 300, 60, 900), ttlSeconds: integer('JOB_TTL_SECONDS', 86400, 3600, 604800),
    allowedOrigins: (env.JOBS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean) };
  if (worker) {
    Object.assign(config, { queueUrl: required('RECOGNITION_QUEUE_URL'), visibilitySeconds: integer('WORKER_VISIBILITY_SECONDS', 300, 90, 43200),
      timeoutMs: integer('WORKER_JOB_TIMEOUT_MS', 180000, 1000, 900000), maxAttempts: integer('WORKER_MAX_ATTEMPTS', 5, 1, 20) });
    if (config.timeoutMs > (config.visibilitySeconds - 60) * 1000) throw new Error('Worker timeout must leave at least 60 seconds before visibility/lease expiry');
  }
  return config;
}
