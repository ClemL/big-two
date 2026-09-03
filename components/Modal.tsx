"use client";

import { useEffect, type ReactNode } from "react";

interface ModalProps {
  title: string;
  children: ReactNode;
  /** Omit to make the dialog non-dismissible (the round summary needs a choice). */
  onClose?: () => void;
}

export function Modal({ title, children, onClose }: ModalProps) {
  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        // Clicks inside the panel bubble up to here as well, so only a click
        // that landed on the backdrop itself should close the dialog.
        if (onClose && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          {onClose ? (
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
