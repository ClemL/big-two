"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { RulesPanel } from "@/components/RulesPanel";
import { RoundSummary, TableView, type OpponentSeat } from "@/components/TableView";
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
  const selectionProblem =
    state && selectedCards.length > 0 ? validatePlay(state, HUMAN, selectedCards) : null;

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
  const status = state.finished
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

  const opponents: OpponentSeat[] = [1, 2, 3].map((index) => {
    const player = state.players[index];
    const badges: OpponentSeat["badges"] = [];
    if (state.leader === index && table) badges.push({ label: "leads" });
    if (state.passed[index]) badges.push({ label: "passed", muted: true });
    return {
      key: index,
      name: player.name,
      cards: player.hand.length,
      isTurn: state.turn === index && !state.finished,
      badges,
    };
  });

  return (
    <TableView
      subtitle="Hong Kong rules · 鋤大弟"
      controls={
        <>
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
          <a className="btn btn--ghost" href="/play">
            Play with friends
          </a>
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
      scoreboard={state.players.map((p) => ({
        key: p.index,
        name: p.name,
        cards: p.hand.length,
        chips: state.scores[p.index],
        isActive: state.turn === p.index && !state.finished,
        isWinner: state.winner === p.index,
        isYou: false,
      }))}
      roundLabel={`Round ${state.roundNumber}`}
      opponents={opponents}
      pile={
        table
          ? {
              combo: table.combo,
              playerName: state.players[table.player].name,
              fromPosition: table.player,
            }
          : null
      }
      clearTableLeader={state.players[state.leader].name}
      status={status}
      message={message || (selectedCards.length > 0 ? selectionProblem : null)}
      hand={humanHand}
      handKey={`${state.roundNumber}-${state.seed}`}
      selected={selected}
      canSelect={myTurn}
      onToggleCard={toggleCard}
      actions={
        <>
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
      }
      log={state.log}
      overlay={
        state.finished && state.lastDeltas ? (
          <Modal title={`${state.players[state.winner!].name} won round ${state.roundNumber}`}>
            <RoundSummary
              rows={state.players.map((p) => ({
                key: p.index,
                name: p.name,
                cards: p.hand.length,
                delta: state.lastDeltas![p.index],
                total: state.scores[p.index],
                isWinner: p.index === state.winner,
              }))}
              action={
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
              }
            />
          </Modal>
        ) : null
      }
    />
  );
}
