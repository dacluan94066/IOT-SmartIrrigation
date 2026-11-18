import { timingSafeEqual } from 'node:crypto';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message); Object.assign(this, { status, code, details });
  }
}
export const ok = (res, data, status = 200, meta) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
export const validate = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid input', result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  return result.data;
};

export function authenticate(token) {
  const expected = Buffer.from(token);
  return (req, res, next) => {
    const supplied = Buffer.from(req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return next(new ApiError(401, 'UNAUTHORIZED', 'Valid Bearer token required'));
    }
    next();
  };
}
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : error.status || 500;
  if (status >= 500) console.error('[API]', error.message);
  res.status(status).json({ success: false, error: {
    code: error.code || (status === 413 ? 'BODY_TOO_LARGE' : status === 400 ? 'INVALID_JSON' : 'INTERNAL_ERROR'),
    message: status >= 500 ? 'Internal server error' : error.message,
    ...(error.details ? { details: error.details } : {})
  } });
}
