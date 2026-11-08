import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { readAIConfig } from '../server/ai/config.js';
import { readCloudConfig } from '../server/cloud/config.js';
import { createJobRepository } from '../server/cloud/job-repository.js';
import { createUploads } from '../server/cloud/uploads.js';
import { createAIProviders } from '../server/ai/providers.js';
import { createEmbeddingService, createEmbeddingStore } from '../server/ai/embeddings.js';
import { createRecognitionService } from '../server/ai/recognition.js';
import { createArtworkAnalysis } from '../server/ai/artwork-analysis.js';
import { catalogues } from '../server/ai/catalogues.js';
import { createMessageProcessor } from './process-job.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFile } from 'node:fs/promises';
import { diagnosticMethods, diagnosticStage, errorDiagnostics } from '../server/ai/diagnostics.js';

export async function runWorker(signal) {
  const ai = readAIConfig(), config = readCloudConfig(process.env, { worker: true });
  if (ai.aiProvider !== 'bedrock' || ai.vectorStore !== 's3vectors') throw new Error('Cloud worker requires AI_PROVIDER=bedrock and VECTOR_STORE=s3vectors');
  const sqs = new SQSClient({ region: config.region, maxAttempts: 2 });
  const repository = createJobRepository(config), uploads = createUploads(config);
  const providers = createAIProviders(ai);
  const embeddings = diagnosticMethods(createEmbeddingService(ai), { generate: 'openclip_embed' });
  const store = diagnosticMethods(createEmbeddingStore(ai), { check: 's3vectors_check', search: 's3vectors_query' });
  await store.check(signal);
  const analysis = createArtworkAnalysis(ai, { vision: diagnosticMethods(providers.vision, { analyse: 'bedrock_analysis' }), embeddings, store });
  const recognition = new Map([...catalogues].map(([museumId, { collection }]) => [museumId,
    createRecognitionService({ config: ai, embeddings, store, ollama: providers.text, collection, museumId })]));
  const processMessage = createMessageProcessor({ config, repository, uploads,
    infer: (job, image, requestSignal) => job.operation === 'analyse' ? analysis.analyse(image, requestSignal) : recognition.get(job.museumId).recognise(image, requestSignal),
    acknowledge: (receipt, requestSignal) => sqs.send(new DeleteMessageCommand({ QueueUrl: config.queueUrl, ReceiptHandle: receipt }), { abortSignal: requestSignal }),
  });
  // Ephemeral liveness marker, never application/user data.
  await writeFile('/tmp/unframe-worker-ready', String(Date.now()));
  console.info(JSON.stringify({ event: 'worker_ready', jobId: null }));
  try {
    while (!signal.aborted) {
      try {
        await writeFile('/tmp/unframe-worker-ready', String(Date.now()));
        const response = await diagnosticStage('sqs_receive', () => sqs.send(new ReceiveMessageCommand({ QueueUrl: config.queueUrl, WaitTimeSeconds: 20, MaxNumberOfMessages: 1, VisibilityTimeout: config.visibilitySeconds }), { abortSignal: signal }));
        for (const message of response.Messages || []) {
          try { await processMessage(message, signal); } catch { /* Processor logged a bounded error; message remains for redelivery. */ }
        }
      } catch (error) {
        if (signal.aborted) break;
        console.warn(JSON.stringify({ event: 'queue_poll_failed', jobId: null, ...errorDiagnostics(error, 'sqs_receive') }));
        await delay(5000, undefined, { signal }).catch(() => {});
      }
    }
  } finally { sqs.destroy(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const shutdown = new AbortController();
  for (const name of ['SIGINT', 'SIGTERM']) process.once(name, () => shutdown.abort());
  runWorker(shutdown.signal).catch(error => { console.error(JSON.stringify({ event: 'worker_start_failed', jobId: null, ...errorDiagnostics(error, 'worker_start') })); process.exitCode = 1; });
}
