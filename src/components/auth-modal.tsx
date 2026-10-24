"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { AuthView, type AuthMode } from "@/components/auth-view";
import { Logo } from "@/components/logo";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  next?: string;
  defaultMode?: AuthMode;
}

export function AuthModal({
  isOpen,
  onClose,
  next = "/events",
  defaultMode = "login",
}: AuthModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width;

    if (!isInDialog) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
      className="backdrop:bg-ink/75 backdrop:backdrop-blur-sm m-auto w-full max-w-md rounded-2xl border-2 border-text bg-surface p-0 text-text shadow-[12px_12px_0_var(--text)] transition-all open:animate-in open:fade-in-0 open:zoom-in-95"
    >
      <div className="relative p-6 sm:p-8">
        {/* Header bar with Logo and Close */}
        <div className="mb-4 flex items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-faint transition-colors hover:border-text hover:bg-raised hover:text-text"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <AuthView
          next={next}
          defaultMode={defaultMode}
          onSuccess={onClose}
        />
      </div>
    </dialog>
  );
}
