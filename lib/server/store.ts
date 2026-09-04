/**
 * Room persistence.
 *
 * Two implementations behind one interface: Upstash Redis over its REST API
 * (no SDK — the REST protocol is a JSON array per command), and an in-process
 * Map for local development and tests.
 *
 * Writes are compare-and-set on the room version. Serverless instances have no
 * shared memory and requests interleave, so "read, decide, write" without a
 * version check would silently drop one of two moves submitted at the same
 * moment.
 */

import type { Room } from "../room.ts";

export type SaveResult = "ok" | "conflict" | "missing";

export interface RoomStore {
  readonly kind: "upstash" | "memory";
  load(id: string): Promise<Room | null>;
  create(room: Room): Promise<boolean>;
  /** Writes only if the stored version still equals `expectedVersion`. */
  save(room: Room, expectedVersion: number): Promise<SaveResult>;
}

/** Rooms are disposable; a week of inactivity is plenty for a game night. */
const ROOM_TTL_SECONDS = 7 * 24 * 60 * 60;

const roomKey = (id: string) => `bigtwo:room:${id}`;
const versionKey = (id: string) => `bigtwo:room:${id}:v`;

/*
 * Version lives in its own key so the check-and-set needs no JSON parsing
 * inside Redis: compare a string, then write both keys atomically.
 */
const CAS_SCRIPT = `
if redis.call('GET', KEYS[2]) ~= ARGV[2] then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
return 1
`;

class UpstashStore implements RoomStore {
  readonly kind = "upstash" as const;

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async command<T>(parts: (string | number)[]): Promise<T> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parts),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Upstash ${response.status}: ${await response.text()}`);
    }
    const payload = (await response.json()) as { result?: T; error?: string };
    if (payload.error) throw new Error(`Upstash: ${payload.error}`);
    return payload.result as T;
  }

  async load(id: string): Promise<Room | null> {
    const raw = await this.command<string | null>(["GET", roomKey(id)]);
    return raw ? (JSON.parse(raw) as Room) : null;
  }

  async create(room: Room): Promise<boolean> {
    const created = await this.command<string | null>([
      "SET",
      roomKey(room.id),
      JSON.stringify(room),
      "NX",
      "EX",
      ROOM_TTL_SECONDS,
    ]);
    if (created === null) return false;
    await this.command(["SET", versionKey(room.id), String(room.version), "EX", ROOM_TTL_SECONDS]);
    return true;
  }

  async save(room: Room, expectedVersion: number): Promise<SaveResult> {
    const applied = await this.command<number>([
      "EVAL",
      CAS_SCRIPT,
      2,
      roomKey(room.id),
      versionKey(room.id),
      JSON.stringify(room),
      String(expectedVersion),
      String(room.version),
      String(ROOM_TTL_SECONDS),
    ]);
    return applied === 1 ? "ok" : "conflict";
  }
}

/**
 * Development and test fallback. Serverless instances do not share memory, so
 * this is single-process only — the API surfaces which store is in use.
 */
class MemoryStore implements RoomStore {
  readonly kind = "memory" as const;
  private readonly rooms = new Map<string, string>();

  async load(id: string): Promise<Room | null> {
    const raw = this.rooms.get(id);
    return raw ? (JSON.parse(raw) as Room) : null;
  }

  async create(room: Room): Promise<boolean> {
    if (this.rooms.has(room.id)) return false;
    this.rooms.set(room.id, JSON.stringify(room));
    return true;
  }

  async save(room: Room, expectedVersion: number): Promise<SaveResult> {
    const raw = this.rooms.get(room.id);
    if (!raw) return "missing";
    const current = JSON.parse(raw) as Room;
    if (current.version !== expectedVersion) return "conflict";
    this.rooms.set(room.id, JSON.stringify(room));
    return "ok";
  }
}

let store: RoomStore | null = null;

export function getRoomStore(): RoomStore {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    store = new UpstashStore(url, token);
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[big-two] UPSTASH_REDIS_REST_URL/TOKEN are unset — falling back to in-memory rooms, " +
          "which are not shared between serverless instances.",
      );
    }
    store = new MemoryStore();
  }
  return store;
}

/** Tests and local tooling only. */
export function setRoomStoreForTesting(next: RoomStore | null): void {
  store = next;
}

export function createMemoryStore(): RoomStore {
  return new MemoryStore();
}
