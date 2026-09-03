"use client";

import { useState } from "react";

export function RulesPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rules">
      <button type="button" className="btn btn--ghost" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide rules" : "Rules"}
      </button>
      {open && (
        <div className="rules__body">
          <h2>Hong Kong Big Two (鋤大弟)</h2>
          <p>
            Four players, 13 cards each. Whoever holds 3♦ opens the round and their first play must
            contain it. The first player to shed every card wins.
          </p>
          <h3>Card order</h3>
          <ul>
            <li>Ranks, low to high: 3 4 5 6 7 8 9 10 J Q K A 2</li>
            <li>Suits, low to high: ♦ &lt; ♣ &lt; ♥ &lt; ♠</li>
          </ul>
          <h3>Legal shapes</h3>
          <ul>
            <li>Single card</li>
            <li>Pair — two of a rank; the higher suit wins ties</li>
            <li>Triple — three of a rank</li>
            <li>Five cards — straight, flush, full house, four of a kind plus any fifth card, straight flush</li>
          </ul>
          <p>
            You must answer with the same number of cards, and beat what is on the table. Four cards
            on their own are not a legal play — quads are played as a five-card hand.
          </p>
          <h3>Five-card ranking</h3>
          <ol>
            <li>Straight — compared by the highest card, suit breaks ties</li>
            <li>Flush — compared by suit first, then by rank</li>
            <li>Full house — compared by the rank of the triple</li>
            <li>Four of a kind — compared by the rank of the quad</li>
            <li>Straight flush — compared by the highest card</li>
          </ol>
          <p>
            Straights run over 3…A,2 with no wrap-around: the lowest is 3-4-5-6-7 and the highest is
            J-Q-K-A-2. A-2-3-4-5 is not a straight here.
          </p>
          <h3>Passing</h3>
          <p>
            You may pass at any time except when leading. Once everyone else has passed, the table
            clears and the last player to play leads a fresh trick with any legal shape.
          </p>
          <h3>Scoring</h3>
          <p>Losers pay one chip per card left, multiplied by how badly they were caught:</p>
          <ul>
            <li>1–7 cards — face value</li>
            <li>8–9 cards — doubled</li>
            <li>10–12 cards — tripled</li>
            <li>13 cards — quadrupled (52 chips)</li>
          </ul>
          <p>The winner collects the whole pot, so every round is zero-sum.</p>
          <h3>Opponents</h3>
          <p>
            The three AI players never pass while they hold a legal play. Their style is switchable:
            <em> lowest legal play</em> makes them dump their cheapest combination every turn, while
            <em> random legal play</em> picks uniformly among everything they could legally play.
          </p>
        </div>
      )}
    </div>
  );
}
