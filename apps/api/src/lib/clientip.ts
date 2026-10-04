import { normalizeIP } from '@fastify/rate-limit';

/**
 * Rate-limit key for the client address: canonical IPv6 masked to /64, IPv4-mapped IPv6 collapsed to IPv4
 * (GHSA-grpc-p53c-r64v). Custom keyGenerators must call this; the plugin only normalizes its default key.
 */
export function clientIp(req: { ip: string }): string {
  return normalizeIP(req.ip, 64);
}
