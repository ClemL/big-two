"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAPTIONS,
  CHAPTERS,
  FILM_DURATION,
  FILM_H,
  FILM_W,
  captionIndexAt,
  chapterAt,
  formatTime,
  renderFrame,
  setFilmBoil,
} from "@/lib/explainer/film";

/** The frame shown before anybody presses play — the title, already drawn on. */
const POSTER_TIME = 3.4;

/** State the render loop needs but React should not re-render for. */
interface Clock {
  t: number;
  last: number;
}

export function Explainer(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const clock = useRef<Clock>({ t: 0, last: 0 });
  const frame = useRef(0);

  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [reduced, setReduced] = useState(false);
  // Bumped at 10Hz while playing: enough for the scrubber and the caption, and
  // far less work than re-rendering React at the frame rate.
  const [tick, setTick] = useState(0);
  const [full, setFull] = useState(false);
  // Read on the client only: asking the document during render makes the first
  // paint disagree with the server's and React throws the tree away.
  const [canFullscreen, setCanFullscreen] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The stage owns the box (CSS aspect-ratio); the canvas only matches it.
    // Setting the height from here as well made the two fight in full screen.
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderFrame(ctx, clock.current.t, w, h);
  }, []);

  // Honour reduced motion by freezing the line work, which is the part that
  // flickers. The film only ever plays on a press, so nothing moves unasked.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = (): void => {
      setReduced(mq.matches);
      setFilmBoil(!mq.matches);
      draw();
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [draw]);

  // Poster frame, and a redraw whenever the box changes width.
  useEffect(() => {
    clock.current.t = POSTER_TIME;
    draw();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    if (!playing) return;
    clock.current.last = performance.now();
    let lastReport = -1;
    const step = (now: number): void => {
      const c = clock.current;
      // A long gap means the tab was away; do not fast-forward through it.
      const dt = Math.min(0.25, Math.max(0, (now - c.last) / 1000));
      c.last = now;
      c.t += dt;
      if (c.t >= FILM_DURATION) {
        c.t = FILM_DURATION;
        draw();
        setPlaying(false);
        setTick((v) => v + 1);
        return;
      }
      draw();
      const report = Math.floor(c.t * 10);
      if (report !== lastReport) {
        lastReport = report;
        setTick((v) => v + 1);
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, draw]);

  // Nothing should keep animating off screen or in a hidden tab.
  useEffect(() => {
    const onHide = (): void => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onHide);
    const wrap = wrapRef.current;
    let io: IntersectionObserver | null = null;
    if (wrap && typeof IntersectionObserver !== "undefined") {
      // isIntersecting stays true for a sliver of the film, so the ratio is
      // what decides: scrolled mostly away means stop.
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.intersectionRatio < 0.25) setPlaying(false);
        },
        { threshold: [0, 0.25, 0.5] },
      );
      io.observe(wrap);
    }
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (io) io.disconnect();
    };
  }, []);

  useEffect(() => {
    setCanFullscreen(!!document.fullscreenEnabled);
    const onChange = (): void => setFull(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (wrap.requestFullscreen) void wrap.requestFullscreen().catch(() => undefined);
  }, []);

  const seek = useCallback(
    (to: number) => {
      clock.current.t = Math.max(0, Math.min(FILM_DURATION, to));
      clock.current.last = performance.now();
      draw();
      setTick((v) => v + 1);
    },
    [draw],
  );

  const toggle = useCallback(() => {
    setStarted(true);
    setPlaying((p) => {
      if (!p && clock.current.t >= FILM_DURATION - 0.05) seek(0);
      return !p;
    });
  }, [seek]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(clock.current.t + 5);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(clock.current.t - 5);
      }
    },
    [toggle, seek],
  );

  const t = clock.current.t;
  const captionIndex = captionIndexAt(t);
  const caption = captionIndex >= 0 ? CAPTIONS[captionIndex].text : "";
  const chapter = chapterAt(t);
  const finished = t >= FILM_DURATION - 0.05;
  const transcript = useMemo(
    () =>
      CHAPTERS.map((ch) => ({
        chapter: ch,
        lines: CAPTIONS.filter((cap) => cap.chapter === ch.index),
      })),
    [],
  );
  void tick;

  return (
    <div className={"film" + (full ? " film--full" : "")} ref={wrapRef}>
      <div
        className="film__stage"
        tabIndex={0}
        role="group"
        aria-label="How to play Big Two — hand-drawn explainer"
        onKeyDown={onKeyDown}
      >
        <canvas className="film__canvas" ref={canvasRef} aria-hidden="true" />
        {!started ? (
          <button type="button" className="film__poster" onClick={toggle}>
            <span className="film__posterBadge">▶</span>
            <span className="film__posterText">
              <strong>How to play, in {formatTime(FILM_DURATION)}</strong>
              <span>Hand-drawn, no sound — subtitles do the talking</span>
            </span>
          </button>
        ) : null}
        {started && !playing ? (
          <button
            type="button"
            className="film__resume"
            onClick={toggle}
            aria-label={finished ? "Watch again" : "Resume"}
          >
            <span>{finished ? "↺" : "▶"}</span>
          </button>
        ) : null}
      </div>

      <div className="film__captions" aria-live="polite" aria-atomic="true">
        {captionsOn && caption ? <p className="film__caption">{caption}</p> : null}
      </div>

      <div className="film__controls">
        <button type="button" className="btn btn--small" onClick={toggle}>
          {playing ? "Pause" : finished ? "Watch again" : started ? "Resume" : "Watch"}
        </button>
        <input
          className="film__scrub"
          type="range"
          min={0}
          max={FILM_DURATION}
          step={0.1}
          value={t}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Scrub the film"
        />
        <span className="film__time">
          {formatTime(t)} / {formatTime(FILM_DURATION)}
        </span>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => setCaptionsOn((v) => !v)}
          aria-pressed={captionsOn}
        >
          {captionsOn ? "Subtitles on" : "Subtitles off"}
        </button>
        {canFullscreen ? (
          <button type="button" className="btn btn--small" onClick={toggleFullscreen} aria-pressed={full}>
            {full ? "Exit full screen" : "Full screen"}
          </button>
        ) : null}
      </div>

      <div className="film__chapters">
        {CHAPTERS.map((ch) => (
          <button
            key={ch.id}
            type="button"
            className={"film__chapter" + (ch.index === chapter.index ? " film__chapter--now" : "")}
            onClick={() => {
              setStarted(true);
              seek(ch.start + 0.05);
              setPlaying(true);
            }}
          >
            <span className="film__chapterTime">{formatTime(ch.start)}</span>
            {ch.title}
          </button>
        ))}
      </div>

      <details className="film__transcript">
        <summary>Read it instead{reduced ? " (recommended — you asked for less motion)" : ""}</summary>
        {transcript.map((group) => (
          <div key={group.chapter.id} className="film__transcriptChapter">
            <h4>{group.chapter.title}</h4>
            {group.lines.map((line) => (
              <p key={line.start}>{line.text}</p>
            ))}
          </div>
        ))}
      </details>
    </div>
  );
}
