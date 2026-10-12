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
  const error = validateSchema(draft);

  useEffect(() => {
    if (open) {
      setDraft(value);
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
              placeholder={`Example:\n\n${JSON_SCHEMA_EXAMPLE}`}
              resize="none"
              minRows={16}
              className="font-mono text-xs"
              error={error}
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
            label: "Save",
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
