/**
 * Fixed-window rate limiting on top of the room store.
 *
 * The password endpoints are the ones that matter: PBKDF2 makes each guess cost
 * the server ~50ms, so an unthrottled guesser burns function time as well as
 * getting unlimited attempts. Limits are applied per room and per caller, so
 * rotating IPs still runs into the room-wide ceiling.
 */

import { getRoomStore } from "./store.ts";

export interface RateLimit {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface LimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export const PASSWORD_PER_CALLER: LimitRule = {
  bucket: "pw-caller",
  limit: 10,
  windowSeconds: 600,
};

export const PASSWORD_PER_ROOM: LimitRule = {
  bucket: "pw-room",
  limit: 40,
  windowSeconds: 600,
};

export const ROOM_CREATION: LimitRule = {
  bucket: "create",
  limit: 20,
  windowSeconds: 3600,
};

export async function checkLimit(rule: LimitRule, key: string): Promise<RateLimit> {
  const count = await getRoomStore().increment(`bigtwo:rl:${rule.bucket}:${key}`, rule.windowSeconds);
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: rule.windowSeconds,
  };
}

/** Returns a 429 response when any rule is exhausted, otherwise null. */
export async function enforce(
  checks: { rule: LimitRule; key: string }[],
): Promise<{ retryAfterSeconds: number } | null> {
  for (const { rule, key } of checks) {
    const result = await checkLimit(rule, key);
    if (!result.allowed) return { retryAfterSeconds: result.retryAfterSeconds };
  }
  return null;
}
