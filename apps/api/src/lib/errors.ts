export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export const notFound = (what = 'resource') => new AppError(404, 'not_found', `${what} not found`);
export const forbidden = (msg = 'forbidden') => new AppError(403, 'forbidden', msg);
export const unauthorized = (msg = 'authentication required') => new AppError(401, 'unauthorized', msg);
