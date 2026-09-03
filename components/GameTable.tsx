"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardBack, CardView } from "@/components/CardView";
import { Modal } from "@/components/Modal";
import { RulesPanel } from "@/components/RulesPanel";
import type { Card, SortMode } from "@/lib/cards";
import { sortHand } from "@/lib/cards";
import { comboName } from "@/lib/combos";
import type { AiStyle } from "@/lib/ai";
import { AI_STYLE_LABEL, chooseMove, suggestMove } from "@/lib/ai";
import * as sound from "@/lib/sound";
import {
  applyPass,
  applyPlay,
  canPass,
  legalMovesFor,
  nextRound,
  startRound,
  validatePlay,
  type GameState,
} from "@/lib/engine";

const HUMAN = 0;
const AI_DELAY_MS = 750;
/** Seat positions around the table for the three opponents. */
const SEATS = [
  { player: 1, className: "seat seat--left" },
  { player: 2, className: "seat seat--top" },
  { player: 3, className: "seat seat--right" },
];

export default function GameTable() {
  const [state, setState] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string>("");
  const [aiStyle, setAiStyle] = useState<AiStyle>("weakest");
  const [sortMode, setSortMode] = useState<SortMode>("rank");
  const [muted, setMuted] = useState(false);
  const seenLogEntries = useRef(0);
  const dealtRound = useRef(-1);

  // Deal on the client so the server render stays deterministic and hydration-safe.
  useEffect(() => {
    setState(startRound({}));
    setMuted(sound.loadMutePreference());
  }, []);

  // Browsers only allow audio to start from a user gesture.
  useEffect(() => {
    const onGesture = () => sound.unlock();
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  // One place to turn game events into sound: every transition lands in the log.
  useEffect(() => {
    if (!state) return;
    if (state.roundNumber !== dealtRound.current) {
      dealtRound.current = state.roundNumber;
      seenLogEntries.current = 0;
      sound.play("deal");
    }
    const fresh = state.log.slice(seenLogEntries.current);
    seenLogEntries.current = state.log.length;
    for (const entry of fresh) {
      if (entry.kind === "win") sound.play(entry.player === HUMAN ? "win" : "lose");
      else sound.play(entry.kind);
    }
  }, [state]);

  // Drive the opponents one move at a time.
  useEffect(() => {
    if (!state || state.finished) return;
    if (state.players[state.turn].isHuman) return;
    const actor = state.turn;
    const timer = setTimeout(() => {
      setState((prev) => {
        if (!prev || prev.finished || prev.turn !== actor || prev.players[actor].isHuman) return prev;
        const move = chooseMove(prev, actor, aiStyle);
        return move ? applyPlay(prev, actor, move.cards) : applyPass(prev, actor);
      });
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, aiStyle]);

  const humanHand = useMemo(
    () => (state ? sortHand(state.players[HUMAN].hand, sortMode) : []),
    [state, sortMode],
  );
  const myTurn = !!state && !state.finished && state.turn === HUMAN;
  const myMoves = useMemo(() => (state && myTurn ? legalMovesFor(state, HUMAN) : []), [state, myTurn]);
  const selectedCards = useMemo(
    () => humanHand.filter((c) => selected.includes(c.id)),
    [humanHand, selected],
  );
  const selectionProblem = state && selectedCards.length > 0 ? validatePlay(state, HUMAN, selectedCards) : null;

  const toggleCard = useCallback(
    (card: Card) => {
      if (!myTurn) return;
      setMessage("");
      setSelected((prev) => {
        const isSelected = prev.includes(card.id);
        sound.play(isSelected ? "deselect" : "select");
        return isSelected ? prev.filter((id) => id !== card.id) : [...prev, card.id];
      });
    },
    [myTurn],
  );

  const toggleMute = useCallback(() => {
    const next = !muted;
    sound.setMuted(next);
    setMuted(next);
    if (!next) sound.unlock();
  }, [muted]);

  const play = useCallback(() => {
    if (!state || !myTurn) return;
    if (selectedCards.length === 0) {
      setMessage("Select the cards you want to play.");
      return;
    }
    const problem = validatePlay(state, HUMAN, selectedCards);
    if (problem) {
      setMessage(problem);
      return;
    }
    setState(applyPlay(state, HUMAN, selectedCards));
    setSelected([]);
    setMessage("");
  }, [state, myTurn, selectedCards]);

  const pass = useCallback(() => {
    if (!state || !myTurn) return;
    if (!canPass(state, HUMAN)) {
      setMessage("You are leading — you have to play something.");
      return;
    }
    setState(applyPass(state, HUMAN));
    setSelected([]);
    setMessage("");
  }, [state, myTurn]);

  const hint = useCallback(() => {
    if (!state || !myTurn) return;
    const move = suggestMove(state, HUMAN);
    if (!move) {
      setMessage("No legal play — you have to pass.");
      setSelected([]);
      return;
    }
    setSelected(move.cards.map((c) => c.id));
    setMessage(`Suggestion: ${comboName(move)}`);
  }, [state, myTurn]);

  if (!state) {
    return (
      <main className="app">
        <p className="loading">Shuffling…</p>
      </main>
    );
  }

  const table = state.table;
  const statusLine = state.finished
    ? `${state.players[state.winner!].name} won round ${state.roundNumber}`
    : myTurn
      ? myMoves.length === 0
        ? "You have no legal play — pass."
        : table
          ? `Your turn — beat the ${comboName(table.combo).toLowerCase()}`
          : state.openingPlay
            ? "Your turn — lead the round with a play containing 3♦"
            : "Your turn — the table is clear, lead any legal shape"
    : `${state.players[state.turn].name} is thinking…`;

  return (
    <main className="app">
      <header className="topbar">
        <div className="topbar__title">
          <h1>Big Two</h1>
          <span className="topbar__sub">Hong Kong rules · 鋤大弟</span>
        </div>
        <div className="topbar__controls">
          <label className="field">
            <span>Opponents</span>
            <select value={aiStyle} onChange={(e) => setAiStyle(e.target.value as AiStyle)}>
              {(Object.keys(AI_STYLE_LABEL) as AiStyle[]).map((style) => (
                <option key={style} value={style}>
                  {AI_STYLE_LABEL[style]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setState(startRound({}));
              setSelected([]);
              setMessage("");
            }}
          >
            New match
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
        </div>
      </header>

      <section className="scoreboard" aria-label="Scores">
        {state.players.map((p) => (
          <div
            key={p.index}
            className={[
              "scoreboard__row",
              state.turn === p.index && !state.finished ? "is-active" : "",
              state.winner === p.index ? "is-winner" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="scoreboard__name">{p.name}</span>
            <span className="scoreboard__cards">
              {p.hand.length} card{p.hand.length === 1 ? "" : "s"}
            </span>
            <span className={`scoreboard__chips ${state.scores[p.index] < 0 ? "is-negative" : ""}`}>
              {state.scores[p.index] > 0 ? `+${state.scores[p.index]}` : state.scores[p.index]}
            </span>
          </div>
        ))}
        <div className="scoreboard__round">Round {state.roundNumber}</div>
      </section>

      <section className="table">
        {SEATS.map(({ player, className }) => {
          const p = state.players[player];
          const isTurn = state.turn === player && !state.finished;
          return (
            <div key={player} className={`${className} ${isTurn ? "is-turn" : ""}`}>
              <div className="seat__name">
                {p.name}
                {state.leader === player && table ? <span className="seat__badge">leads</span> : null}
                {state.passed[player] ? <span className="seat__badge seat__badge--muted">passed</span> : null}
              </div>
              <CardBack count={p.hand.length} />
            </div>
          );
        })}

        <div className="pile">
          {table ? (
            <>
              <div className="pile__label">
                {state.players[table.player].name} · {comboName(table.combo)}
              </div>
              {/* Keyed on the play so a new one remounts and replays the animation. */}
              <div className="pile__cards" key={table.combo.cards.map((c) => c.id).join("-")}>
                {table.combo.cards.map((c, i) => (
                  <CardView key={c.id} card={c} index={i} from={table.player} />
                ))}
              </div>
            </>
          ) : (
            <div className="pile__empty">
              Table is clear
              <span>{state.players[state.leader].name} leads</span>
            </div>
          )}
        </div>
      </section>

      <section className="status" role="status">
        <span>{statusLine}</span>
        {message ? <span className="status__message">{message}</span> : null}
        {!message && selectedCards.length > 0 && selectionProblem ? (
          <span className="status__message">{selectionProblem}</span>
        ) : null}
      </section>

      <section className="hand" aria-label="Your hand" key={`${state.roundNumber}-${state.seed}`}>
        {humanHand.map((card, i) => (
          <CardView
            key={card.id}
            card={card}
            index={i}
            selected={selected.includes(card.id)}
            disabled={!myTurn}
            onClick={toggleCard}
          />
        ))}
      </section>

      <section className="actions">
        <button type="button" className="btn btn--primary" onClick={play} disabled={!myTurn}>
          Play
        </button>
        <button
          type="button"
          className="btn"
          onClick={pass}
          disabled={!myTurn || !canPass(state, HUMAN)}
        >
          Pass
        </button>
        <button type="button" className="btn" onClick={hint} disabled={!myTurn}>
          Hint
        </button>
        <button type="button" className="btn" onClick={() => setSelected([])} disabled={selected.length === 0}>
          Clear
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setSortMode((m) => (m === "rank" ? "suit" : "rank"))}
        >
          Sort: {sortMode === "rank" ? "rank" : "suit"}
        </button>
      </section>

      <section className="log" aria-label="Play history">
        {state.log
          .slice(-6)
          .reverse()
          .map((entry, i) => (
            <div key={`${state.log.length - i}`} className={`log__line log__line--${entry.kind}`}>
              {entry.text}
            </div>
          ))}
      </section>

      {state.finished && state.lastDeltas ? (
        <Modal title={`${state.players[state.winner!].name} won round ${state.roundNumber}`}>
          <>
            <table className="results">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Cards left</th>
                  <th>Round</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {state.players.map((p) => (
                  <tr key={p.index} className={p.index === state.winner ? "is-winner" : ""}>
                    <td>{p.name}</td>
                    <td>{p.hand.length}</td>
                    <td className={state.lastDeltas![p.index] < 0 ? "is-negative" : ""}>
                      {state.lastDeltas![p.index] > 0
                        ? `+${state.lastDeltas![p.index]}`
                        : state.lastDeltas![p.index]}
                    </td>
                    <td>{state.scores[p.index]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setState(nextRound(state));
                setSelected([]);
                setMessage("");
              }}
            >
              Next round
            </button>
          </>
        </Modal>
      ) : null}
    </main>
  );
}
