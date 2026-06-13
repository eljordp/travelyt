"use client";

import { useState } from "react";

export default function CopyValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg border border-navy/10 bg-white px-3 py-2 text-left text-xs font-bold text-navy transition hover:border-coral hover:text-coral"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
