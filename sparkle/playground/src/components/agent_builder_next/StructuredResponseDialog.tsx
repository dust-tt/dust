import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  File04,
  Hoverable,
  Icon,
  TextArea,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { JSON_SCHEMA_EXAMPLE } from "./data";

function validateSchema(value: string): string | null {
  if (!value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return "The schema must be a JSON object.";
    }
    if (parsed.type !== "object") {
      return 'The root schema must have "type": "object".';
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid JSON.";
  }
}

export function StructuredResponseDialog({
  open,
  onOpenChange,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onSave: (schema: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Validate live so Save can be gated, but only show the message once the
  // user has left the field: half-typed JSON is not an error yet.
  const [isTouched, setIsTouched] = useState(false);
  const error = validateSchema(draft);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setIsTouched(false);
    }
  }, [open, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" height="lg">
        <DialogHeader>
          <DialogTitle visual={<Icon visual={File04} size="sm" />}>
            Structured response format
          </DialogTitle>
          <DialogDescription>
            Specify a JSON schema to get responses in a consistent structure.
            See{" "}
            <Hoverable
              variant="highlight"
              href="https://docs.dust.tt"
              target="_blank"
            >
              documentation
            </Hoverable>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex h-full flex-col gap-2">
            <TextArea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => setIsTouched(true)}
              placeholder={`Example:\n\n${JSON_SCHEMA_EXAMPLE}`}
              resize="none"
              minRows={16}
              className="font-mono md:text-xs"
              error={isTouched ? error : undefined}
              showErrorLabel
            />
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => onOpenChange(false),
          }}
          rightButtonProps={{
            label: "Save schema",
            variant: "primary",
            disabled: error !== null,
            onClick: () => {
              onSave(draft.trim());
              onOpenChange(false);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
