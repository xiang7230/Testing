export function assertSessionId(id) {
  if (!Number.isSafeInteger(id) || id <= 0) 
    throw new Error('sessionId must be a positive integer');
  return id;
}
export function isoTimestamp(value, name = 'timestamp') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) 
    throw new Error(`${name} must be an ISO-8601 timestamp`);
  return new Date(value).toISOString();
}
export function nonNegativeInt(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) 
    throw new Error(`${name} must be a nonnegative integer`);
  return value;
}
