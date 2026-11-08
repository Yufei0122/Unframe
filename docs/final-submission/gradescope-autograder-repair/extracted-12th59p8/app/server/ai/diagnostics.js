import { AIError } from './config.js';

// Diagnostic-only metadata; never attach raw SDK responses/causes to API errors.
const failures = new WeakMap();
const stages = {
  message_parse: ['SQS', 'ParseNotification'], job_validate: ['Worker', 'ValidateJob'],
  dynamodb_get: ['DynamoDB', 'GetItem'], dynamodb_claim: ['DynamoDB', 'UpdateItem'],
  dynamodb_complete: ['DynamoDB', 'UpdateItem'], dynamodb_fail: ['DynamoDB', 'UpdateItem'],
  s3_get_object: ['S3', 'GetObject'], s3_delete_object: ['S3', 'DeleteObject'],
  image_normalize: ['Sharp', 'NormalizeImage'], inference: ['Worker', 'Infer'],
  openclip_embed: ['OpenCLIP', 'Embed'], s3vectors_check: ['S3Vectors', 'GetIndex'],
  s3vectors_query: ['S3Vectors', 'QueryVectors'], bedrock_converse: ['Bedrock', 'Converse'],
  bedrock_response: ['Bedrock', 'ParseResponse'],
  bedrock_analysis: ['Bedrock', 'Analyse'], sqs_receive: ['SQS', 'ReceiveMessage'],
  sqs_delete: ['SQS', 'DeleteMessage'], worker_start: ['Worker', 'Start'],
};
const awsCodes = new Set(('AccessDenied AccessDeniedException ValidationException InvalidRequestException ResourceNotFoundException NotFoundException NoSuchKey NoSuchBucket NoSuchVersion InvalidObjectState PreconditionFailed ConditionalCheckFailedException ProvisionedThroughputExceededException ThrottlingException Throttling RequestLimitExceeded SlowDown ServiceUnavailable ServiceUnavailableException InternalError InternalServerError InternalServerException RequestTimeout RequestTimeoutException ModelTimeoutException ModelErrorException ModelNotReadyException ServiceQuotaExceededException UnrecognizedClientException InvalidSignatureException ExpiredToken ExpiredTokenException InvalidAccessKeyId SignatureDoesNotMatch KMSAccessDeniedException KMSDisabledException').split(' '));
const types = new Set(('Error TypeError RangeError SyntaxError AbortError TimeoutError CredentialsProviderError TokenProviderError').split(' '));
const appCodes = new Set(('INVALID_INPUT INVALID_IMAGE_TYPE INVALID_IMAGE IMAGE_TOO_LARGE INVALID_VECTOR INVALID_VECTOR_DISTANCE OPENCLIP_MODEL_MISMATCH INDEX_INCOMPATIBLE INVALID_VECTOR_METADATA EMPTY_COLLECTION EMPTY_INDEX INDEX_UNAVAILABLE INDEX_SOURCE_UNAVAILABLE OPENCLIP_TIMEOUT OPENCLIP_UNAVAILABLE OPENCLIP_RESPONSE REQUEST_CANCELLED BEDROCK_TIMEOUT BEDROCK_UNAVAILABLE BEDROCK_INCOMPLETE BEDROCK_RESPONSE BEDROCK_JSON BEDROCK_SCHEMA AI_BUSY VISION_TIMEOUT').split(' '));
const networkCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE']);
const objectError = error => error !== null && (typeof error === 'object' || typeof error === 'function');
const requestId = value => typeof value === 'string' && (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value) || /^[A-Z0-9]{16}$/.test(value)) ? value : null;

export function errorDiagnostics(error, stage = 'inference') {
  if (objectError(error) && failures.has(error)) return failures.get(error);
  const [service, operation] = stages[stage] || ['Worker', 'Unknown'];
  const awsCode = [error?.name, error?.Code, error?.code].find(code => awsCodes.has(code)) || null;
  const code = appCodes.has(error?.code) || /^OPENCLIP_HTTP_\d{3}$/.test(error?.code) || networkCodes.has(error?.code) ? error.code : null;
  const status = error?.$metadata?.httpStatusCode;
  return { stage: stages[stage] ? stage : 'unknown', service, operation,
    exceptionType: error instanceof AIError ? 'AIError' : awsCodes.has(error?.name) || types.has(error?.name) ? error.name : 'UnknownError',
    errorCode: code, awsErrorCode: awsCode,
    awsRequestId: requestId(error?.$metadata?.requestId),
    httpStatusCode: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null };
}

export async function diagnosticStage(stage, action) {
  try { return await action(); }
  catch (error) {
    if (objectError(error) && !failures.has(error)) failures.set(error, errorDiagnostics(error, stage));
    throw error;
  }
}

export function preserveDiagnostics(target, source, stage) {
  failures.set(target, { ...errorDiagnostics(source, stage), errorCode: appCodes.has(target.code) ? target.code : null });
  return target;
}

// Wrap at the worker's service boundary, leaving transport/recognition untouched.
export function diagnosticMethods(service, methods) {
  return Object.fromEntries(Object.entries(service).map(([name, method]) => [name,
    methods[name] ? (...args) => diagnosticStage(methods[name], () => method.apply(service, args)) : method]));
}
