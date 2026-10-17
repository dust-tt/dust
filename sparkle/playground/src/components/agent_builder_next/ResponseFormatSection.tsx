import { Button, Edit04, XClose } from "@dust-tt/sparkle";
import { useState } from "react";

import { getModelById } from "./data";
import { FieldRow } from "./SectionContainer";
import { StructuredResponseDialog } from "./StructuredResponseDialog";
import { ValueMenu } from "./ValueMenu";

type FormatMode = "text" | "json";

/**
 * Format and schema rows. A hand-written schema is never lost by a click:
 * switching to Text keeps it so switching back restores it, and Remove can
 * be undone until the next change.
 */
export function ResponseFormatRows({
  modelId,
  responseFormat,
  onResponseFormatChange,
}: {
  modelId: string;
  responseFormat: string;
  onResponseFormatChange: (schema: string) => void;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [keptSchema, setKeptSchema] = useState("");
  const [removedSchema, setRemovedSchema] = useState<string | null>(null);
  const supportsStructuredOutput =
    getModelById(modelId).supportsStructuredOutput;
  const hasSchema = responseFormat.trim().length > 0;
  const mode: FormatMode = hasSchema ? "json" : "text";

  return (
    <>
      <FieldRow label="Format">
        <ValueMenu<FormatMode>
          value={mode}
          ariaLabel="Response format"
          options={[
            { id: "text", label: "Text", description: "Free-form replies." },
            {
              id: "json",
              label: "JSON schema",
              description: supportsStructuredOutput
                ? "Replies follow a schema you define."
                : "Needs a model that supports structured output.",
              disabled: !supportsStructuredOutput,
            },
          ]}
          onSelect={(next) => {
            if (next === "text") {
              if (hasSchema) {
                setKeptSchema(responseFormat);
              }
              onResponseFormatChange("");
            } else if (keptSchema) {
              onResponseFormatChange(keptSchema);
            } else {
              setIsDialogOpen(true);
            }
          }}
        />
      </FieldRow>
      {hasSchema ? (
        <FieldRow label="Schema">
          <Button
            size="sm"
            variant="outline"
            icon={Edit04}
            label="Edit schema"
            onClick={() => setIsDialogOpen(true)}
          />
          <Button
            size="sm"
            variant="ghost"
            icon={XClose}
            label="Remove"
            onClick={() => {
              setRemovedSchema(responseFormat);
              setKeptSchema("");
              onResponseFormatChange("");
            }}
          />
        </FieldRow>
      ) : removedSchema ? (
        <FieldRow label="Schema" hint="Removed.">
          <Button
            size="sm"
            variant="ghost"
            label="Undo"
            onClick={() => {
              onResponseFormatChange(removedSchema);
              setRemovedSchema(null);
            }}
          />
        </FieldRow>
      ) : null}
      <StructuredResponseDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        value={responseFormat || keptSchema}
        onSave={(schema) => {
          setRemovedSchema(null);
          onResponseFormatChange(schema);
        }}
      />
    </>
  );
}
