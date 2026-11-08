// Never serialize Ajv errors directly: messages/params can contain model-authored
// property names, enum values or other response content. Return only four fields.
const types = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const constraints = new Set(['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minProperties', 'maxProperties']);
const categories = new Set(['type', 'required', 'additionalProperties', 'enum', 'const', 'pattern', 'format', 'anyOf', 'oneOf', 'not', 'uniqueItems', ...constraints]);
const actualType = value => value === undefined ? 'missing' : value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const fieldName = key => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key);

export function schemaIssueDiagnostics(errors, schema, value) {
  const fields = new Set(), visited = new WeakSet();
  function visit(node) {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    for (const key of Object.keys(node.properties || {})) if (fieldName(key)) fields.add(key);
    for (const child of Object.values(node)) if (child && typeof child === 'object') visit(child);
  }
  visit(schema);
  return (errors || []).slice(0, 5).map(issue => {
    const category = categories.has(issue.keyword) ? issue.keyword : 'validation';
    const tokens = typeof issue.instancePath === 'string' ? issue.instancePath.split('/').slice(1) : [];
    let current = value;
    const path = [];
    for (const token of tokens.slice(0, 16)) {
      const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
      path.push((Array.isArray(current) && /^(0|[1-9]\d{0,5})$/.test(key)) || fields.has(key) ? key : '[redacted]');
      current = current && typeof current === 'object' && Object.hasOwn(current, key) ? current[key] : undefined;
    }
    if (tokens.length > 16) { path.push('[truncated]'); current = undefined; }
    if (category === 'required') {
      const key = issue.params?.missingProperty;
      path.push(fields.has(key) ? key : '[redacted]');
      current = undefined;
    } else if (category === 'additionalProperties') {
      const key = issue.params?.additionalProperty;
      path.push('[additional-property]');
      current = current && typeof current === 'object' && Object.hasOwn(current, key) ? current[key] : undefined;
    }
    let expected = 'schema constraint';
    if (category === 'type') {
      const wanted = Array.isArray(issue.params?.type) ? issue.params.type : [issue.params?.type];
      expected = wanted.length && wanted.every(type => types.has(type)) ? wanted.join(' | ') : 'schema type';
    } else if (constraints.has(category)) {
      const limit = issue.params?.limit;
      expected = Number.isFinite(limit) ? `${category}: ${limit}` : category;
    } else {
      expected = { required: 'required property', additionalProperties: 'no additional properties',
        enum: 'allowed enum value', const: 'schema constant', pattern: 'schema pattern', format: 'schema format',
        anyOf: 'at least one allowed schema', oneOf: 'exactly one allowed schema', not: 'excluded schema must not match',
        uniqueItems: 'unique array items' }[category] || expected;
    }
    return { path: path.length ? '/' + path.join('/') : '', expected, actualType: actualType(current), category };
  });
}
