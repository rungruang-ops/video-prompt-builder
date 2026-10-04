import { z, ZodError, type ZodTypeAny } from 'zod';
import { AppError } from './errors.js';
export { z };
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw new AppError(400, 'validation_error', 'ข้อมูลไม่ถูกต้อง: ' + r.error.issues.map(i => `${i.path.join('.') || 'body'} ${i.message}`).join('; '), r.error.issues);
  return r.data;
}
export const isZod = (e: unknown): e is ZodError => e instanceof ZodError;
export const Uuid = z.string().uuid();
