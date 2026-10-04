import { z, ZodError } from 'zod';
import { AppError } from './errors.js';
export { z };

/** Public shape of a validation issue (kept small and stable across zod versions; never echoes the input). */
export type IssueDetail = { path: (string | number)[]; code: string; message: string };
export const issueDetails = (e: ZodError): IssueDetail[] =>
  e.issues.map(i => ({ path: i.path.map(k => (typeof k === 'number' ? k : String(k))), code: i.code, message: i.message }));

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const details = issueDetails(r.error);
    throw new AppError(400, 'validation_error', 'ข้อมูลไม่ถูกต้อง: ' + details.map(i => `${i.path.join('.') || 'body'} ${i.message}`).join('; '), details);
  }
  return r.data;
}
export const isZod = (e: unknown): e is ZodError => e instanceof ZodError;
/** RFC 9562 UUID (zod 4 is stricter than zod 3 here; all ids come from gen_random_uuid(), i.e. v4). */
export const Uuid = z.uuid();
