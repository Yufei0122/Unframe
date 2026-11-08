import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export function createJobRepository(config, client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region, maxAttempts: 2 }), { marshallOptions: { removeUndefinedValues: true } })) {
  const send = (command, signal) => client.send(command, { abortSignal: signal });
  return {
    async create(job) { await send(new PutCommand({ TableName: config.tableName, Item: job, ConditionExpression: 'attribute_not_exists(jobId)' })); },
    async get(jobId, signal) { return (await send(new GetCommand({ TableName: config.tableName, Key: { jobId }, ConsistentRead: true }), signal)).Item; },
    async claim(jobId, owner, now, signal) {
      const response = await send(new UpdateCommand({ TableName: config.tableName, Key: { jobId },
        ConditionExpression: 'attribute_exists(jobId) AND expiresAt > :now AND (#status IN (:waiting, :retrying) OR (#status = :processing AND leaseUntil < :now))',
        UpdateExpression: 'SET #status = :processing, leaseOwner = :owner, leaseUntil = :lease, updatedAt = :now REMOVE #error ADD attempts :one',
        ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
        ExpressionAttributeValues: { ':now': now, ':waiting': 'WAITING_UPLOAD', ':retrying': 'RETRYING', ':processing': 'PROCESSING', ':owner': owner, ':lease': now + config.visibilitySeconds, ':one': 1 },
        ReturnValues: 'ALL_NEW' }), signal);
      return response.Attributes;
    },
    async complete(jobId, owner, result, now, signal) {
      if (Buffer.byteLength(JSON.stringify(result)) > 300000) throw new Error('Job result exceeds storage budget');
      await send(new UpdateCommand({ TableName: config.tableName, Key: { jobId },
        ConditionExpression: '#status = :processing AND leaseOwner = :owner',
        UpdateExpression: 'SET #status = :success, #result = :result, updatedAt = :now, completedAt = :now REMOVE leaseOwner, leaseUntil, #error',
        ExpressionAttributeNames: { '#status': 'status', '#result': 'result', '#error': 'error' },
        ExpressionAttributeValues: { ':processing': 'PROCESSING', ':owner': owner, ':success': 'SUCCEEDED', ':result': result, ':now': now } }), signal);
    },
    async fail(jobId, owner, attempts, now) {
      await send(new UpdateCommand({ TableName: config.tableName, Key: { jobId },
        ConditionExpression: '#status = :processing AND leaseOwner = :owner',
        UpdateExpression: 'SET #status = :next, #error = :error, updatedAt = :now REMOVE leaseOwner, leaseUntil',
        ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
        ExpressionAttributeValues: { ':processing': 'PROCESSING', ':owner': owner, ':next': attempts >= config.maxAttempts ? 'FAILED' : 'RETRYING',
          ':error': { code: 'PROCESSING_FAILED', message: attempts >= config.maxAttempts ? 'Processing failed. Please submit another image.' : 'Processing will be retried.' }, ':now': now } }), AbortSignal.timeout(10000));
    },
  };
}
