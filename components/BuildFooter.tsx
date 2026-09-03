"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "";

/**
 * Changelog lines live in public/updates.txt, one per line, appended oldest
 * first. The footer shows the newest line; the dialog shows all of them,
 * newest first.
 */
export function BuildFooter() {
  const [updates, setUpdates] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/updates.txt")
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error("not found"))))
      .then((text) => {
        if (cancelled) return;
        setUpdates(
          text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        );
      })
      // A missing or unreadable changelog is not worth an error state.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = updates.length > 0 ? updates[updates.length - 1] : null;
  const stamp = [
    `Big Two · v${VERSION}`,
    BUILD_TIME ? `built ${BUILD_TIME} UTC` : null,
    COMMIT_SHA ? COMMIT_SHA : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <footer className="build-info">
      <div className="build-info__inner">
        <div className="build-info__version">{stamp}</div>
        {latest ? (
          <button
            type="button"
            className="changelog-trigger"
            onClick={() => setOpen(true)}
            title="Show the full changelog"
          >
            {latest}
          </button>
        ) : null}
      </div>

      {open && latest ? (
        <Modal title="Changelog" onClose={() => setOpen(false)}>
          <ul className="changelog-list">
            {updates
              .slice()
              .reverse()
              .map((line, i) => (
                <li key={`${updates.length - i}-${line}`}>{line}</li>
              ))}
          </ul>
        </Modal>
      ) : null}
    </footer>
  );
}
