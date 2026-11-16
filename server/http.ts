import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type z } from 'zod';
import type { PageMeta } from '../shared/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function route(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function requestId(res: Response): string {
  return String(res.locals.requestId ?? 'unknown');
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Проверьте заполнение полей.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function parseQuery<T>(schema: z.ZodType<T>, query: Request['query']): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Некорректные параметры запроса.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function pageMeta(total: number, page: number, pageSize: number): PageMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function pagination(query: { page: number; pageSize: number }): {
  limit: number;
  offset: number;
} {
  return {
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  };
}

export function parseId(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Запись не найдена.');
  }
  return id;
}

export function unsupportedMediaType(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    next();
    return;
  }
  if (!req.is('application/json') && !req.is('application/*+json')) {
    if (
      req.method === 'POST' &&
      req.path.endsWith('/convert') &&
      (req.headers['content-length'] === '0' || req.headers['content-length'] === undefined)
    ) {
      next();
      return;
    }
    next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Ожидается application/json.'));
    return;
  }
  next();
}

export function methodNotAllowed(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается для этого маршрута.'));
}

export function apiNotFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'NOT_FOUND', 'Маршрут не найден.'));
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  const id = requestId(res);

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
        requestId: id,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Проверьте заполнение полей.',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
        requestId: id,
      },
    });
    return;
  }

  const maybe = error as { type?: string; status?: number; message?: string };
  if (maybe.type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Тело запроса слишком большое.',
        requestId: id,
      },
    });
    return;
  }
  if (maybe.type === 'entity.parse.failed') {
    res.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        message: 'Не удалось разобрать JSON.',
        requestId: id,
      },
    });
    return;
  }
  if (maybe.status === 415) {
    res.status(415).json({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Ожидается application/json.',
        requestId: id,
      },
    });
    return;
  }

  console.error(`[${id}] ${req.method} ${req.originalUrl}`, error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Внутренняя ошибка. Подробности в логе сервера.',
      requestId: id,
    },
  });
}
