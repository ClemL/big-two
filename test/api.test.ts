import test from "node:test";
import assert from "node:assert/strict";
import {
  claimTableEndpoint,
  controlEndpoint,
  createRoomEndpoint,
  joinEndpoint,
  leaveSeatEndpoint,
  moveEndpoint,
  releaseTableEndpoint,
  seatCookieName,
  stateEndpoint,
  tableCookieName,
  versionEndpoint,
} from "../lib/server/api.ts";
import { createMemoryStore, setRoomStoreForTesting } from "../lib/server/store.ts";
import type { PublicRoom } from "../lib/room.ts";

/** Each test gets an empty store, so counters and rooms never leak between them. */
function freshStore() {
  setRoomStoreForTesting(createMemoryStore());
}

interface Client {
  cookies: Map<string, string>;
}

const client = (): Client => ({ cookies: new Map() });

function post(url: string, body: unknown, who?: Client, headers: Record<string, string> = {}): Request {
  return request("POST", url, body, who, headers);
}

function request(
  method: string,
  url: string,
  body?: unknown,
  who?: Client,
  headers: Record<string, string> = {},
): Request {
  const all: Record<string, string> = { "content-type": "application/json", ...headers };
  if (who && who.cookies.size > 0) {
    all.cookie = [...who.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  return new Request(`https://example.test${url}`, {
    method,
    headers: all,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Capture Set-Cookie so a client keeps its identity across calls. */
function absorb(who: Client, response: Response): Response {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    const name = pair.slice(0, index).trim();
    const value = decodeURIComponent(pair.slice(index + 1).trim());
    if (value === "") who.cookies.delete(name);
    else who.cookies.set(name, value);
  }
  return response;
}

async function newRoom(password = "letmein"): Promise<string> {
  const response = await createRoomEndpoint(post("/api/rooms", { password }));
  assert.equal(response.status, 201);
  const { id } = (await response.json()) as { id: string };
  return id;
}

async function seatedClient(roomId: string, seat: number, name: string, password = "letmein") {
  const who = client();
  const response = absorb(who, await joinEndpoint(post(`/x/${roomId}/join`, { seat, password, name }, who), roomId));
  assert.equal(response.status, 200, await response.clone().text());
  return { who, view: (await response.json()) as PublicRoom };
}

test("creating a room validates the password and returns an id", async () => {
  freshStore();
  for (const password of ["", "ab", "x".repeat(129), 42]) {
    const response = await createRoomEndpoint(post("/api/rooms", { password }));
    assert.equal(response.status, 400, `password ${JSON.stringify(password)}`);
  }
  const bad = await createRoomEndpoint(
    new Request("https://example.test/api/rooms", { method: "POST", body: "not json" }),
  );
  assert.equal(bad.status, 400);

  const ok = await createRoomEndpoint(post("/api/rooms", { password: "letmein" }));
  assert.equal(ok.status, 201);
  const body = (await ok.json()) as { id: string; storage: string };
  assert.match(body.id, /^[A-Z0-9]{6}$/);
  assert.equal(body.storage, "memory");
});

test("an unknown room is a 404 everywhere", async () => {
  freshStore();
  assert.equal((await versionEndpoint("ZZZZZZ")).status, 404);
  assert.equal((await stateEndpoint(request("GET", "/x"), "ZZZZZZ")).status, 404);
  assert.equal((await joinEndpoint(post("/x", { seat: 0, password: "x" }), "ZZZZZZ")).status, 404);
  assert.equal((await moveEndpoint(post("/x", { action: "pass" }), "ZZZZZZ")).status, 404);
  assert.equal((await controlEndpoint(post("/x", { action: "nextRound" }), "ZZZZZZ")).status, 404);
});

test("joining sets a seat cookie and the wrong password is refused", async () => {
  freshStore();
  const roomId = await newRoom();
  const who = client();

  const refused = await joinEndpoint(post("/x", { seat: 0, password: "nope" }, who), roomId);
  assert.equal(refused.status, 403);
  assert.equal(who.cookies.size, 0, "no cookie is issued on a failed attempt");

  const ok = absorb(who, await joinEndpoint(post("/x", { seat: 0, password: "letmein", name: "Kris" }, who), roomId));
  assert.equal(ok.status, 200);
  assert.ok(who.cookies.has(seatCookieName(roomId)));
  const cookie = ok.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
});

test("a claimed seat is refused to the next caller", async () => {
  freshStore();
  const roomId = await newRoom();
  await seatedClient(roomId, 1, "Kris");
  const second = await joinEndpoint(post("/x", { seat: 1, password: "letmein", name: "Srini" }), roomId);
  assert.equal(second.status, 409);
});

test("state is redacted per caller and the seed never appears", async () => {
  freshStore();
  const roomId = await newRoom();
  const { who: a } = await seatedClient(roomId, 0, "Kris");
  const { who: b } = await seatedClient(roomId, 1, "Srini");

  const viewA = (await (await stateEndpoint(request("GET", "/x", undefined, a), roomId)).json()) as PublicRoom;
  const viewB = (await (await stateEndpoint(request("GET", "/x", undefined, b), roomId)).json()) as PublicRoom;
  assert.equal(viewA.seat, 0);
  assert.equal(viewB.seat, 1);
  assert.equal(viewA.seats.filter((s) => s.hand).length, 1);
  assert.equal(viewA.seats[0].hand?.length, 13);
  assert.equal(viewA.seats[1].hand, undefined);
  assert.equal(JSON.stringify(viewA).includes('"seed"'), false);

  // A caller with no cookie is a spectator and gets no cards at all.
  const spectator = (await (await stateEndpoint(request("GET", "/x"), roomId)).json()) as PublicRoom;
  assert.equal(spectator.seat, null);
  assert.ok(spectator.seats.every((s) => s.hand === undefined));
});

test("the polled version endpoint carries no cards", async () => {
  freshStore();
  const roomId = await newRoom();
  await seatedClient(roomId, 0, "Kris");
  const response = await versionEndpoint(roomId);
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(text.includes('"hand"'), false);
  assert.ok(text.length < 400, `version payload is ${text.length} bytes`);
});

test("moving requires a seat cookie, and rejects forged cards and stale versions", async () => {
  freshStore();
  const roomId = await newRoom();
  const { who: a, view } = await seatedClient(roomId, 0, "Kris");
  await seatedClient(roomId, 1, "Srini");

  const anonymous = await moveEndpoint(post("/x", { action: "pass" }), roomId);
  assert.equal(anonymous.status, 403);

  const nonsense = await moveEndpoint(post("/x", { action: "dance" }, a), roomId);
  assert.equal(nonsense.status, 400);

  const tooMany = await moveEndpoint(
    post("/x", { action: "play", cardIds: ["3D", "4D", "5D", "6D", "7D", "8D"] }, a),
    roomId,
  );
  assert.equal(tooMany.status, 400, "a six-card play is not a shape");

  const stale = await moveEndpoint(post("/x", { action: "pass", version: view.version - 1 }, a), roomId);
  assert.equal(stale.status, 409);

  // Card ownership is only reached once it is that seat's turn, so ask from
  // the seat that actually holds the lead.
  const seats = [a, (await seatedClient(roomId, 2, "C")).who, (await seatedClient(roomId, 3, "D")).who];
  const current = (await (await stateEndpoint(request("GET", "/x", undefined, a), roomId)).json()) as PublicRoom;
  const actor = [a, undefined, seats[1], seats[2]][current.turn];
  if (actor) {
    const forged = await moveEndpoint(post("/x", { action: "play", cardIds: ["ZZ"] }, actor), roomId);
    assert.equal(forged.status, 400, "a card that is not in the hand is refused");
  }

  // Out of turn is refused whoever asks.
  const outOfTurn = await moveEndpoint(
    post("/x", { action: "play", cardIds: ["3D"] }, current.turn === 0 ? seats[1] : a),
    roomId,
  );
  assert.equal(outOfTurn.status, 409);
});

test("a full legal play succeeds and bumps the version", async () => {
  freshStore();
  const roomId = await newRoom();
  const seats = [
    (await seatedClient(roomId, 0, "A")).who,
    (await seatedClient(roomId, 1, "B")).who,
    (await seatedClient(roomId, 2, "C")).who,
    (await seatedClient(roomId, 3, "D")).who,
  ];
  const before = (await (await stateEndpoint(request("GET", "/x", undefined, seats[0]), roomId)).json()) as PublicRoom;
  const opener = seats[before.turn];
  const view = (await (await stateEndpoint(request("GET", "/x", undefined, opener), roomId)).json()) as PublicRoom;
  const three = view.seats[view.seat!].hand!.find((c) => c.id === "3D");
  assert.ok(three, "the seat to act holds 3♦");

  const played = await moveEndpoint(post("/x", { action: "play", cardIds: ["3D"] }, opener), roomId);
  assert.equal(played.status, 200);
  const after = (await played.json()) as PublicRoom;
  assert.equal(after.version, view.version + 1);
  assert.equal(after.seats[after.seat!].hand!.length, 12);
});

test("leaving a seat clears the cookie and frees it", async () => {
  freshStore();
  const roomId = await newRoom();
  const { who } = await seatedClient(roomId, 2, "Kris");
  const left = absorb(who, await leaveSeatEndpoint(request("DELETE", "/x", undefined, who), roomId));
  assert.equal(left.status, 200);
  assert.equal(who.cookies.has(seatCookieName(roomId)), false);
  assert.equal((await leaveSeatEndpoint(request("DELETE", "/x", undefined, who), roomId)).status, 403);
});

test("the table display has its own token and its own powers", async () => {
  freshStore();
  const roomId = await newRoom();
  const { who: player } = await seatedClient(roomId, 0, "Kris");
  const tablet = client();

  assert.equal((await claimTableEndpoint(post("/x", { password: "wrong" }, tablet), roomId)).status, 403);

  const claimed = absorb(tablet, await claimTableEndpoint(post("/x", { password: "letmein" }, tablet), roomId));
  assert.equal(claimed.status, 200);
  assert.ok(tablet.cookies.has(tableCookieName(roomId)));
  const view = (await claimed.json()) as PublicRoom;
  assert.equal(view.isTableSeat, true);
  assert.ok(view.seats.every((s) => s.hand === undefined), "the table is never sent a hand");

  // A player may not drive the match, and the table may not play cards.
  assert.equal((await controlEndpoint(post("/x", { action: "resetMatch" }, player), roomId)).status, 403);
  assert.equal((await controlEndpoint(post("/x", { action: "resetMatch" }), roomId)).status, 403);
  assert.equal((await moveEndpoint(post("/x", { action: "pass" }, tablet), roomId)).status, 403);

  const adjusted = await controlEndpoint(
    post("/x", { action: "adjustScore", seat: 1, delta: -5 }, tablet),
    roomId,
  );
  assert.equal(adjusted.status, 200);
  assert.equal(((await adjusted.json()) as PublicRoom).scores[1], -5);

  assert.equal((await controlEndpoint(post("/x", { action: "nextRound" }, tablet), roomId)).status, 409);
  assert.equal((await controlEndpoint(post("/x", { action: "sudo" }, tablet), roomId)).status, 400);

  const released = absorb(tablet, await releaseTableEndpoint(request("DELETE", "/x", undefined, tablet), roomId));
  assert.equal(released.status, 200);
  assert.equal((await releaseTableEndpoint(request("DELETE", "/x", undefined, tablet), roomId)).status, 403);
});

test("a player still sees their own hand while the table is active", async () => {
  freshStore();
  const roomId = await newRoom();
  const { who: player } = await seatedClient(roomId, 0, "Kris");
  const tablet = client();
  absorb(tablet, await claimTableEndpoint(post("/x", { password: "letmein" }, tablet), roomId));

  const view = (await (await stateEndpoint(request("GET", "/x", undefined, player), roomId)).json()) as PublicRoom;
  assert.equal(view.tableSeatActive, true);
  assert.equal(view.isTableSeat, false);
  assert.equal(view.seats[0].hand?.length, 13);
});

test("password guessing is rate limited per caller", async () => {
  freshStore();
  const roomId = await newRoom();
  const from = (ip: string) => ({ "x-forwarded-for": ip });

  let sawLimit = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await joinEndpoint(
      post("/x", { seat: 0, password: "guess" }, undefined, from("203.0.113.9")),
      roomId,
    );
    if (response.status === 429) {
      sawLimit = true;
      assert.equal(response.headers.get("retry-after"), "600");
      break;
    }
    assert.equal(response.status, 403);
  }
  assert.ok(sawLimit, "the caller is cut off inside a dozen attempts");

  // A different caller still gets its own allowance, up to the room ceiling.
  const other = await joinEndpoint(
    post("/x", { seat: 0, password: "guess" }, undefined, from("198.51.100.4")),
    roomId,
  );
  assert.equal(other.status, 403);
});

test("password guessing is also capped room-wide across callers", async () => {
  freshStore();
  const roomId = await newRoom();
  let limited = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await joinEndpoint(
      post("/x", { seat: 0, password: "guess" }, undefined, { "x-forwarded-for": `10.0.0.${attempt}` }),
      roomId,
    );
    if (response.status === 429) limited++;
  }
  assert.ok(limited > 0, "rotating IPs still runs into the room-wide ceiling");
});

test("room creation is rate limited", async () => {
  freshStore();
  let limited = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    const response = await createRoomEndpoint(
      post("/api/rooms", { password: "letmein" }, undefined, { "x-forwarded-for": "203.0.113.1" }),
    );
    if (response.status === 429) {
      limited = true;
      break;
    }
  }
  assert.ok(limited, "a caller cannot mint rooms without limit");
});
