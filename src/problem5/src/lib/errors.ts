// Single source of truth for app errors. Every thrown AppError flows
// through the central error handler and serialises to the documented
// `{ error: { code, message, details? } }` shape.

export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly status: number;
  readonly code: AppErrorCode;
  readonly details?: unknown;

  constructor(
    status: number,
    code: AppErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static invalidCredentials(): AppError {
    // Identical message + code for both "wrong password" and "unknown email"
    // — we never confirm whether the email exists. See AC-P5-AUTH-2/3.
    return new AppError(
      401,
      'INVALID_CREDENTIALS',
      'Invalid email or password',
    );
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }
}
