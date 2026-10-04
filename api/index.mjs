// Vercel Function: every /api/* request is rewritten here (see vercel.json) and handed to the Fastify app.
// Built from apps/api (tsc) during `npm run build`; see apps/api/src/vercel.ts.
export { default } from '../apps/api/dist/vercel.js';
