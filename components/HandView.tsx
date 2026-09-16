"use client";

import { useMemo } from "react";
import { CardView } from "@/components/CardView";
import type { Card } from "@/lib/cards";
import { comboName } from "@/lib/combos";
import { planFor } from "@/lib/strategy";
import { arcAngle, type HandLayout } from "@/lib/handSettings";

/**
 * The player's own hand, in whichever shape they have chosen.
 *
 * One component rather than one per view: the full table and the pocket layout
 * both show the same hand, and a fourth arrangement should not have to be
 * written twice.
 */

export interface HandViewProps {
  hand: Card[];
  layout: HandLayout;
  selected: string[];
  dimmed?: string[];
  canSelect: boolean;
  onToggleCard: (card: Card) => void;
  /** Changing this replays the deal animation. */
  handKey: string;
}

export function HandView({
  hand,
  layout,
  selected,
  dimmed = [],
  canSelect,
  onToggleCard,
  handKey,
}: HandViewProps) {
  // The decomposition is a bitmask DP over every combination in the hand, so it
  // is memoised on the cards rather than recomputed on each selection change.
  const ids = hand.map((c) => c.id).join(",");
  const groups = useMemo(
    () => (layout === "grouped" && hand.length > 0 ? planFor(hand).groups : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, ids],
  );

  // No `key` in here: React warns when one is spread in rather than written on
  // the element, and a spread key is not guaranteed to keep working.
  const cardProps = (card: Card, index: number) => ({
    card,
    index,
    selected: selected.includes(card.id),
    dimmed: dimmed.includes(card.id),
    disabled: !canSelect,
    onClick: onToggleCard,
  });

  if (layout === "grouped" && groups.length > 0) {
    // The deal stagger runs on this index, so it counts cards rather than
    // group slots — spacing it by group left the last group arriving a second
    // after the first.
    let dealt = -1;
    return (
      <section className="hand hand--grouped" aria-label="Your hand" key={handKey}>
        {groups.map((group) => (
          <div className="hand-group" key={group.cards.map((c) => c.id).join("-")}>
            <div className="hand-group__cards">
              {group.cards.map((card) => (
                <CardView key={card.id} {...cardProps(card, ++dealt)} />
              ))}
            </div>
            <span className="hand-group__tag">{comboName(group)}</span>
          </div>
        ))}
      </section>
    );
  }

  if (layout === "arc") {
    return (
      <section className="hand hand--arc" aria-label="Your hand" key={handKey}>
        {hand.map((card, i) => (
          <div
            className="hand-arc__slot"
            key={card.id}
            style={{ "--arc": `${arcAngle(i, hand.length).toFixed(2)}deg` } as React.CSSProperties}
          >
            <CardView key={card.id} {...cardProps(card, i)} />
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="hand" aria-label="Your hand" key={handKey}>
      {hand.map((card, i) => (
        <CardView key={card.id} {...cardProps(card, i)} />
      ))}
    </section>
  );
}
