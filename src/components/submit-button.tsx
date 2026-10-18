"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

// Every form button shows progress and blocks double submits while its Server Action runs.
export function SubmitButton({ children, className = "btn btn-primary", pendingText }: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          {pendingText ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}
