"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { AuthModal } from "@/components/auth-modal";
import type { AuthMode } from "@/components/auth-view";

interface LoginButtonProps {
  next?: string;
  compact?: boolean;
  label?: React.ReactNode;
  variant?: "primary" | "dark" | "ghost" | "quiet";
  defaultMode?: AuthMode;
  className?: string;
  showIcon?: boolean;
}

export function LoginButton({
  next = "/",
  compact = false,
  label = "Log in",
  variant = "primary",
  defaultMode = "login",
  className,
  showIcon = true,
}: LoginButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const baseClass = compact
    ? "btn btn-dark btn-sm"
    : `btn btn-${variant}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={className ? `${baseClass} ${className}` : baseClass}
      >
        {showIcon && <LogIn className="h-4 w-4" aria-hidden="true" />}
        {label}
      </button>

      {isOpen && (
        <AuthModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          next={next}
          defaultMode={defaultMode}
        />
      )}
    </>
  );
}

// Backward-compatible alias
export const SignInButton = LoginButton;
