import { Input, TextArea } from "@dust-tt/sparkle";
import { useLayoutEffect, useState } from "react";

interface GmailComposeEditorProps {
  editedFields: Record<string, string>;
  setEditedFields: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  disabled: boolean;
}

function parseEmailArray(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.join(", ");
    }
    // JSON but not an array (e.g. '""' when the input was undefined) — treat as empty
    return "";
  } catch {
    // not JSON — treat as plain comma-separated text
  }
  return raw;
}

function serializeEmailArray(value: string): string {
  const emails = value
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  return JSON.stringify(emails);
}

export function GmailComposeEditor({
  editedFields,
  setEditedFields,
  disabled,
}: GmailComposeEditorProps) {
  const [showCc, setShowCc] = useState(
    () => !!parseEmailArray(editedFields["cc"] ?? "[]")
  );
  const [showBcc, setShowBcc] = useState(
    () => !!parseEmailArray(editedFields["bcc"] ?? "[]")
  );

  // Normalize email array fields on mount so they always hold valid JSON arrays.
  // When blockedAction.inputs["cc"] is undefined, the parent initializes editedFields["cc"]
  // as '""' (JSON-encoded empty string). Submitting that would send cc="" (string) instead
  // of cc=[] (array), failing the MCP schema validation.
  useLayoutEffect(() => {
    setEditedFields((prev) => {
      const updates: Record<string, string> = {};
      for (const key of ["to", "cc", "bcc"]) {
        const display = parseEmailArray(prev[key] ?? "");
        const normalized = serializeEmailArray(display);
        if (normalized !== prev[key]) {
          updates[key] = normalized;
        }
      }
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [setEditedFields]);

  function handleEmailField(key: string, value: string) {
    setEditedFields((prev) => ({
      ...prev,
      [key]: serializeEmailArray(value),
    }));
  }

  function handleTextField(key: string, value: string) {
    setEditedFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-lg dark:border-border-night">
      {/* Compose header */}
      <div className="flex items-center bg-muted-background px-3 py-2 dark:bg-muted-background-night">
        <span className="text-xs font-semibold text-foreground dark:text-foreground-night">
          New message
        </span>
        <div className="ml-auto flex gap-2">
          {!showCc && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground dark:text-muted-foreground-night dark:hover:text-foreground-night"
              onClick={() => setShowCc(true)}
            >
              Cc
            </button>
          )}
          {!showBcc && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground dark:text-muted-foreground-night dark:hover:text-foreground-night"
              onClick={() => setShowBcc(true)}
            >
              Bcc
            </button>
          )}
        </div>
      </div>

      {/* Field rows */}
      <div className="flex flex-col bg-background dark:bg-background-night">
        <FieldRow label="To">
          <Input
            value={parseEmailArray(editedFields["to"] ?? "[]")}
            onChange={(e) => handleEmailField("to", e.target.value)}
            disabled={disabled}
            placeholder="Recipients"
            className="rounded-none border-0 shadow-none focus-visible:ring-0"
          />
        </FieldRow>

        {showCc && (
          <FieldRow label="Cc">
            <Input
              value={parseEmailArray(editedFields["cc"] ?? "[]")}
              onChange={(e) => handleEmailField("cc", e.target.value)}
              disabled={disabled}
              placeholder="CC recipients"
              className="rounded-none border-0 shadow-none focus-visible:ring-0"
            />
          </FieldRow>
        )}

        {showBcc && (
          <FieldRow label="Bcc">
            <Input
              value={parseEmailArray(editedFields["bcc"] ?? "[]")}
              onChange={(e) => handleEmailField("bcc", e.target.value)}
              disabled={disabled}
              placeholder="BCC recipients"
              className="rounded-none border-0 shadow-none focus-visible:ring-0"
            />
          </FieldRow>
        )}

        <FieldRow label="Subject">
          <Input
            value={editedFields["subject"] ?? ""}
            onChange={(e) => handleTextField("subject", e.target.value)}
            disabled={disabled}
            placeholder="Subject"
            className="rounded-none border-0 shadow-none focus-visible:ring-0"
          />
        </FieldRow>

        {/* Body */}
        <div className="border-t border-border p-2 dark:border-border-night">
          <TextArea
            value={editedFields["body"] ?? ""}
            onChange={(e) => handleTextField("body", e.target.value)}
            disabled={disabled}
            minRows={6}
            placeholder="Write your email..."
            className="resize-none border-0 p-1 shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
    </div>
  );
}

interface FieldRowProps {
  label: string;
  children: React.ReactNode;
}

function FieldRow({ label, children }: FieldRowProps) {
  return (
    <div className="flex items-center border-b border-border dark:border-border-night">
      <span className="w-14 shrink-0 pl-3 text-xs text-muted-foreground dark:text-muted-foreground-night">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
