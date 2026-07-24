import { Redis } from "@upstash/redis";

// Minimal key-value contract used by the app. Backed by Upstash Redis when
// configured; otherwise an in-process store so the app runs anywhere.
// The in-memory fallback does NOT persist across serverless invocations —
// it exists for local dev and preview demos.
export interface KV {
  hgetall(key: string): Promise<Record<string, string> | null>;
  hset(key: string, value: Record<string, string | number>): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
  zrem(key: string, member: string): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

/**
 * Dashboard-pasted env values often arrive with surrounding quotes, stray
 * whitespace, or accidental duplicate lines. Reduce to the first clean line
 * so a slightly mangled paste doesn't take down every request.
 */
function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return undefined;
  const unquoted = firstLine.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  return unquoted || undefined;
}

function upstashKV(redis: Redis): KV {
  return {
    async hgetall(key) {
      const value = await redis.hgetall(key);
      if (!value || Object.keys(value).length === 0) return null;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(value)) out[k] = String(v);
      return out;
    },
    async hset(key, value) {
      await redis.hset(key, value);
    },
    async hdel(key, field) {
      await redis.hdel(key, field);
    },
    async sadd(key, member) {
      await redis.sadd(key, member);
    },
    async srem(key, member) {
      await redis.srem(key, member);
    },
    async smembers(key) {
      return redis.smembers(key);
    },
    async zadd(key, score, member) {
      await redis.zadd(key, { score, member });
    },
    async zrangebyscore(key, min, max) {
      return (await redis.zrange(key, min, max, { byScore: true })) as string[];
    },
    async zrem(key, member) {
      await redis.zrem(key, member);
    },
    async expire(key, seconds) {
      await redis.expire(key, seconds);
    },
    async del(key) {
      await redis.del(key);
    },
  };
}

interface MemoryStore {
  hashes: Map<string, Record<string, string>>;
  sets: Map<string, Set<string>>;
  zsets: Map<string, Map<string, number>>;
  expiries: Map<string, number>;
}

function memoryKV(): KV {
  const g = globalThis as unknown as { __communionStore?: MemoryStore };
  const store: MemoryStore = (g.__communionStore ??= {
    hashes: new Map(),
    sets: new Map(),
    zsets: new Map(),
    expiries: new Map(),
  });

  const expired = (key: string) => {
    const deadline = store.expiries.get(key);
    if (deadline !== undefined && Date.now() > deadline) {
      store.hashes.delete(key);
      store.sets.delete(key);
      store.zsets.delete(key);
      store.expiries.delete(key);
      return true;
    }
    return false;
  };

  return {
    async hgetall(key) {
      if (expired(key)) return null;
      const value = store.hashes.get(key);
      return value && Object.keys(value).length > 0 ? { ...value } : null;
    },
    async hset(key, value) {
      if (expired(key)) {
        // fall through — a fresh write recreates the key
      }
      const existing = store.hashes.get(key) ?? {};
      for (const [k, v] of Object.entries(value)) existing[k] = String(v);
      store.hashes.set(key, existing);
    },
    async hdel(key, field) {
      delete store.hashes.get(key)?.[field];
    },
    async sadd(key, member) {
      const set = store.sets.get(key) ?? new Set<string>();
      set.add(member);
      store.sets.set(key, set);
    },
    async srem(key, member) {
      store.sets.get(key)?.delete(member);
    },
    async smembers(key) {
      return [...(store.sets.get(key) ?? [])];
    },
    async zadd(key, score, member) {
      const zset = store.zsets.get(key) ?? new Map<string, number>();
      zset.set(member, score);
      store.zsets.set(key, zset);
    },
    async zrangebyscore(key, min, max) {
      const zset = store.zsets.get(key);
      if (!zset) return [];
      return [...zset.entries()]
        .filter(([, score]) => score >= min && score <= max)
        .sort((a, b) => a[1] - b[1])
        .map(([member]) => member);
    },
    async zrem(key, member) {
      store.zsets.get(key)?.delete(member);
    },
    async expire(key, seconds) {
      store.expiries.set(key, Date.now() + seconds * 1000);
    },
    async del(key) {
      store.hashes.delete(key);
      store.sets.delete(key);
      store.zsets.delete(key);
      store.expiries.delete(key);
    },
  };
}

let cached: KV | null = null;

export function db(): KV {
  if (cached) return cached;
  const url = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  cached = url && token ? upstashKV(new Redis({ url, token })) : memoryKV();
  return cached;
}

export const keys = {
  allEvents: "events:all",
  allChurches: "churches:all",
  churchRequests: (churchId: string) => `church:${churchId}:requests`,
  user: (userId: string) => `user:${userId}`,
  userChurches: (userId: string) => `user:${userId}:churches`,
  userPlans: (userId: string) => `user:${userId}:plans`,
  userNotes: (userId: string, bookNr: number) =>
    `user:${userId}:notes:${bookNr}`,
  userPushSubs: (userId: string) => `user:${userId}:push`,
  church: (churchId: string) => `church:${churchId}`,
  churchMembers: (churchId: string) => `church:${churchId}:members`,
  churchEvents: (churchId: string) => `church:${churchId}:events`,
  invite: (token: string) => `invite:${token}`,
  event: (eventId: string) => `event:${eventId}`,
  eventRsvps: (eventId: string) => `event:${eventId}:rsvps`,
};
