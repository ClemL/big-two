"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { RulesPanel } from "@/components/RulesPanel";
import { PocketView } from "@/components/PocketView";
import { RoundSummary, TableView, type OpponentSeat } from "@/components/TableView";
import {
  useAutoHint,
  useAutoPass,
  useDoubleTap,
  useGameKeys,
  useHandLayout,
  useTurnSignal,
  useWakeLock,
} from "@/components/hooks";
import type { Card, SortMode } from "@/lib/cards";
import { sortHand } from "@/lib/cards";
import { comboName, identify, legalMoves } from "@/lib/combos";
import { previousPlays } from "@/lib/engine";
import * as sound from "@/lib/sound";
import type { PublicRoom } from "@/lib/room";
import { HAND_LAYOUT_LABEL, type HandLayout } from "@/lib/handSettings";

/** How often the tiny version endpoint is polled while the tab is visible. */
const POLL_MS = 3000;

interface OnlineTableProps {
  roomId: string;
  initial: PublicRoom;
  onLeave: () => void;
}

/** Rotate absolute seats so the viewer always sits at the bottom. */
function relativeSeat(absolute: number, me: number): number {
  return (absolute - me + 4) % 4;
}

export function OnlineTable({ roomId, initial, onLeave }: OnlineTableProps) {
  const [room, setRoom] = useState<PublicRoom>(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("rank");
  const [muted, setMuted] = useState(false);
  const seenLogEntries = useRef(initial.log.length);
  const dealtRound = useRef(initial.roundNumber);
  const [arrival, setArrival] = useState<string>("");
  const [handLayout, setHandLayout] = useHandLayout();
  // Resolved after mount: window.location is not there for the server render.
  const [origin, setOrigin] = useState("");

  const seat = room.seat;
  const myHand = useMemo(() => {
    const hand = seat === null ? [] : (room.seats[seat].hand ?? []);
    return sortHand(hand, sortMode);
  }, [room, seat, sortMode]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    setMuted(sound.loadMutePreference());
    const onGesture = () => sound.unlock();
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/rooms/${roomId}/state`, { cache: "no-store" });
    if (!response.ok) return;
    setRoom((await response.json()) as PublicRoom);
  }, [roomId]);

  // Poll the 8-byte version endpoint; fetch the full state only when it moves.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (!cancelled && document.visibilityState === "visible") {
        try {
          const response = await fetch(`/api/rooms/${roomId}/version`, { cache: "no-store" });
          if (response.ok) {
            const { version } = (await response.json()) as { version: number };
            if (!cancelled && version !== room.version) await refresh();
          }
        } catch {
          // A dropped poll is not worth surfacing; the next one will catch up.
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    timer = setTimeout(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [roomId, room.version, refresh]);

  // Same approach as single player: new log entries become sound.
  useEffect(() => {
    if (room.roundNumber !== dealtRound.current) {
      dealtRound.current = room.roundNumber;
      seenLogEntries.current = 0;
      sound.play("deal");
    }
    const fresh = room.log.slice(seenLogEntries.current);
    seenLogEntries.current = room.log.length;
    for (const entry of fresh) {
      if (entry.kind === "win") sound.play(entry.player === seat ? "win" : "lose");
      else sound.play(entry.kind);
    }
  }, [room, seat]);

  const myTurn = room.yourTurn;
  const selectedCards = useMemo(
    () => myHand.filter((c) => selected.includes(c.id)),
    [myHand, selected],
  );
  const myMoves = useMemo(
    () =>
      myTurn
        ? legalMoves(myHand, {
            current: room.table?.combo ?? null,
            mustInclude: room.openingPlay ? "3D" : null,
          })
        : [],
    [myTurn, myHand, room.table, room.openingPlay],
  );

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      try {
        const response = await fetch(`/api/rooms/${roomId}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, version: room.version }),
        });
        if (response.ok) {
          if (Array.isArray(body.cardIds)) {
            const ids = new Set(body.cardIds as string[]);
            setJustPlayed(myHand.filter((card) => ids.has(card.id)));
          }
          setRoom((await response.json()) as PublicRoom);
          setSelected([]);
          setMessage("");
          return;
        }
        const { error } = (await response.json().catch(() => ({ error: "Something went wrong." }))) as {
          error?: string;
        };
        setMessage(error ?? "Something went wrong.");
        // A rejected move usually means the table moved on; resync.
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [roomId, room.version, refresh, myHand],
  );

  // The phone has no pile, so it shows the cards you sent on their way out.
  const [justPlayed, setJustPlayed] = useState<Card[] | null>(null);
  useEffect(() => {
    if (!justPlayed) return;
    const timer = setTimeout(() => setJustPlayed(null), 1400);
    return () => clearTimeout(timer);
  }, [justPlayed]);

  const rename = useCallback(
    async (name: string) => {
      const response = await fetch(`/api/rooms/${roomId}/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.ok) setRoom((await response.json()) as PublicRoom);
      else await refresh();
    },
    [roomId, refresh],
  );

  const registerTap = useDoubleTap();

  const toggleCard = useCallback(
    (card: Card) => {
      if (!myTurn || busy) return;
      setMessage("");
      // Tapping the same card twice plays it when that single would be legal;
      // the server re-checks either way.
      if (registerTap(card.id) && myMoves.some((m) => m.size === 1 && m.cards[0].id === card.id)) {
        void send({ action: "play", cardIds: [card.id] });
        return;
      }
      setSelected((prev) => {
        const isSelected = prev.includes(card.id);
        sound.play(isSelected ? "deselect" : "select");
        return isSelected ? prev.filter((id) => id !== card.id) : [...prev, card.id];
      });
    },
    [myTurn, busy, registerTap, myMoves, send],
  );

  const canPass = myTurn && room.table !== null;

  const play = useCallback(() => {
    if (selectedCards.length === 0) {
      setMessage("Select the cards you want to play.");
      return;
    }
    // Checked here for a fast message; the server checks again authoritatively.
    const combo = identify(selectedCards);
    if (!combo) {
      setMessage("That is not a legal combination.");
      return;
    }
    void send({ action: "play", cardIds: selectedCards.map((c) => c.id) });
  }, [selectedCards, send]);

  const hint = useCallback(() => {
    const move = myMoves[0];
    if (!move) {
      setMessage("No legal play — you have to pass.");
      setSelected([]);
      return;
    }
    setSelected(move.cards.map((c) => c.id));
    setMessage(`Suggestion: ${comboName(move)}`);
  }, [myMoves]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    sound.setMuted(next);
    setMuted(next);
    if (!next) sound.unlock();
  }, [muted]);

  const dimmed = useMemo(() => {
    if (!myTurn || myMoves.length === 0) return [];
    const playable = new Set(myMoves.flatMap((move) => move.cards.map((c) => c.id)));
    return myHand.filter((card) => !playable.has(card.id)).map((card) => card.id);
  }, [myTurn, myMoves, myHand]);

  useAutoHint(myTurn, hint);

  // A phone spends the game face down when a tablet is the table.
  useTurnSignal(myTurn, seat !== null);
  // A sleeping phone stops polling, which is what used to lose people their seat.
  useWakeLock(seat !== null);
  useAutoPass(myTurn && !busy && myMoves.length === 0 && room.table !== null, () => {
    void send({ action: "pass" });
  });
  useGameKeys({
    enabled: myTurn && !busy,
    onPlay: play,
    onPass: () => void send({ action: "pass" }),
    onHint: hint,
    onClear: () => setSelected([]),
  });

  const me = seat ?? 0;
  const seatName = (index: number) => room.seats[index].name;
  const namesRef = useRef<string[]>(room.seats.map((s) => s.name));
  namesRef.current = room.seats.map((s) => s.name);

  // A seat only counts as somebody else when a person is behind it and still
  // present; `automated` already folds in the idle window. Keyed on a string so
  // the identity survives a poll that changed nothing — the effect below must
  // fire on an actual arrival, not on every refetch.
  const humanKey = room.seats
    .filter((s) => s.claimed && !s.automated)
    .map((s) => s.index)
    .join(",");
  const humanSeats = useMemo(
    () => (humanKey === "" ? [] : humanKey.split(",").map(Number)),
    [humanKey],
  );
  const others = humanSeats.filter((index) => index !== seat);
  const alone = seat !== null && others.length === 0;

  // Someone arriving mid-match is easy to miss: their seat simply stops saying
  // "AI". Call it out when the set of people grows.
  const knownHumans = useRef<number[] | null>(null);
  useEffect(() => {
    const previous = knownHumans.current;
    knownHumans.current = humanSeats;
    if (previous === null) return;
    const fresh = humanSeats.filter((index) => index !== seat && !previous.includes(index));
    if (fresh.length === 0) return;
    setArrival(
      fresh.length === 1
        ? `${namesRef.current[fresh[0]]} sat down and took over that seat.`
        : `${fresh.length} players sat down.`,
    );
  }, [humanSeats, seat]);

  // Expiry hangs off the message, not off the poll: tying it to the effect
  // above let a refetch mid-countdown either cut the notice short or strand it
  // on screen, depending on which landed first.
  useEffect(() => {
    if (!arrival) return;
    const timer = setTimeout(() => setArrival(""), 8000);
    return () => clearTimeout(timer);
  }, [arrival]);

  const status = room.finished
    ? `${seatName(room.winner!)} won round ${room.roundNumber}`
    : myTurn
      ? myMoves.length === 0
        ? "No legal play — passing for you."
        : room.table
          ? `Your turn — beat the ${comboName(room.table.combo).toLowerCase()}`
          : room.openingPlay
            ? "Your turn — lead the round with a play containing 3♦"
            : "Your turn — the table is clear, lead any legal shape"
      : `Waiting for ${seatName(room.turn)}…`;

  const opponents: OpponentSeat[] = [1, 2, 3].map((offset) => {
    const index = (me + offset) % 4;
    const seatInfo = room.seats[index];
    const badges: OpponentSeat["badges"] = [];
    if (room.leader === index && room.table) badges.push({ label: "leads" });
    if (seatInfo.automated) badges.push({ label: "AI", muted: true });
    if (room.passed[index]) badges.push({ label: "passed", muted: true });
    return {
      key: index,
      name: seatInfo.name,
      cards: seatInfo.cards,
      isTurn: room.turn === index && !room.finished,
      badges,
    };
  });

  const actionButtons = (
    <>
      <button type="button" className="btn btn--primary" onClick={play} disabled={!myTurn || busy}>
        Play
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => void send({ action: "pass" })}
        disabled={!canPass || busy}
      >
        Pass
      </button>
      <button type="button" className="btn" onClick={hint} disabled={!myTurn || busy}>
        Hint
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => setSelected([])}
        disabled={selected.length === 0}
      >
        Clear
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setSortMode((m) => (m === "rank" ? "suit" : "rank"))}
      >
        Sort: {sortMode === "rank" ? "rank" : "suit"}
      </button>
    </>
  );

  const summary =
    room.finished && room.lastDeltas ? (
      <Modal title={`${seatName(room.winner!)} won round ${room.roundNumber}`}>
        <RoundSummary
          rows={room.seats.map((s) => ({
            key: s.index,
            name: s.name,
            cards: s.cards,
            delta: room.lastDeltas![s.index],
            total: room.scores[s.index],
            isWinner: s.index === room.winner,
          }))}
          action={
            room.tableSeatActive ? (
              <p className="lobby__hint">The table deals the next round.</p>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void send({ action: "nextRound" })}
                disabled={busy || seat === null}
              >
                Next round
              </button>
            )
          }
        />
      </Modal>
    ) : null;

  // A tablet is showing the shared state to the room, so the phone only needs
  // to carry this player's own hand and actions.
  // The table display runs the lobby, so a phone in pocket mode only needs to
  // be told to wait.
  if (room.tableSeatActive && seat !== null && room.phase === "lobby") {
    return (
      <main className="app pocket">
        <header className="pocket__bar">
          <span className="pocket__seat">{`Seat ${seat + 1} · ${seatName(seat)}`}</span>
          <span className="pocket__room">{`Room ${room.id}`}</span>
        </header>
        <p className="pocket__status">You are in. Waiting for the table to start the game…</p>
        <p className="pocket__to-beat">Your cards appear here once they are dealt.</p>
      </main>
    );
  }

  if (room.tableSeatActive && seat !== null) {
    return (
      <PocketView
        roomLabel={`Room ${room.id}`}
        seatLabel={`Seat ${seat + 1} · ${seatName(seat)}`}
        seatName={seatName(seat)}
        onRename={(name) => void rename(name)}
        justPlayed={justPlayed}
        status={status}
        message={message}
        toBeat={room.table?.combo ?? null}
        others={[1, 2, 3].map((offset) => {
          const index = (me + offset) % 4;
          return {
            key: index,
            name: room.seats[index].name,
            cards: room.seats[index].cards,
            isTurn: room.turn === index && !room.finished,
          };
        })}
        layout={handLayout}
        hand={myHand}
        handKey={`${room.id}-${room.roundNumber}`}
        selected={selected}
        dimmed={dimmed}
        canSelect={myTurn && !busy}
        onToggleCard={toggleCard}
        actions={actionButtons}
        overlay={summary}
      />
    );
  }


  const shareLink = `${origin}/room/${room.id}`;
  const waiting = room.phase === "lobby";

  const banner = waiting ? (
    <section className="presence presence--alone" role="status">
      <p className="presence__line">
        <strong>Waiting to start.</strong> Empty seats will play as AI. Start when everyone who is
        coming has joined.
      </p>
      <p className="presence__share">
        Send them <code>{shareLink}</code>
      </p>
      <p className="presence__share">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void send({ action: "startMatch" })}
          disabled={busy}
        >
          Start game
        </button>
      </p>
    </section>
  ) :
    arrival || alone ? (
      <section className={`presence ${alone ? "presence--alone" : "presence--joined"}`} role="status">
        {arrival ? (
          <p className="presence__line">{arrival}</p>
        ) : (
          <>
            <p className="presence__line">
              <strong>You are the only one here.</strong> The AI is playing the other three seats, so
              carry on — anyone who turns up takes over a seat mid-match.
            </p>
            <p className="presence__share">
              Send them <code>{shareLink}</code>
            </p>
          </>
        )}
      </section>
    ) : null;

  return (
    <TableView
      banner={banner}
      handLayout={handLayout}
      subtitle={`Room ${room.id} · ${seat === null ? "watching" : `you are ${seatName(seat)}`}`}
      controls={
        <>
          <label className="field">
            <span>Hand</span>
            <select value={handLayout} onChange={(e) => setHandLayout(e.target.value as HandLayout)}>
              {(Object.keys(HAND_LAYOUT_LABEL) as HandLayout[]).map((key) => (
                <option key={key} value={key}>
                  {HAND_LAYOUT_LABEL[key]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn--ghost" onClick={onLeave}>
            Leave seat
          </button>
          <button
            type="button"
            className="btn btn--icon"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
            title={muted ? "Sound off" : "Sound on"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <RulesPanel />
        </>
      }
      scoreboard={room.seats.map((s) => ({
        key: s.index,
        name: s.name,
        cards: s.cards,
        chips: room.scores[s.index],
        isActive: room.turn === s.index && !room.finished,
        isWinner: room.winner === s.index,
        isYou: s.index === seat,
      }))}
      roundLabel={`Round ${room.roundNumber}`}
      opponents={opponents}
      pile={
        room.table
          ? {
              combo: room.table.combo,
              playerName: seatName(room.table.player),
              fromPosition: relativeSeat(room.table.player, me),
            }
          : null
      }
      previousPlays={previousPlays(room.history, room.table).map((play) => ({
        key: `${play.trick}-${play.player}-${play.combo.cards.map((c) => c.id).join("")}`,
        combo: play.combo,
        playerName: seatName(play.player),
        spent: room.table !== null && play.trick < room.table.trick,
      }))}
      clearTableLeader={seatName(room.leader)}
      status={status}
      message={message}
      hand={myHand}
      handKey={`${room.id}-${room.roundNumber}`}
      selected={selected}
      dimmed={dimmed}
      canSelect={myTurn && !busy}
      onToggleCard={toggleCard}
      actions={actionButtons}
      log={room.log}
      overlay={summary}
    />
  );
}
