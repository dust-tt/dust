import { Button, Edit04, XClose } from "@dust-tt/sparkle";
import { useState } from "react";

import { getModelById } from "./data";
import { FieldRow } from "./SectionContainer";
import { StructuredResponseDialog } from "./StructuredResponseDialog";

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
  const supportsStructuredOutput =
    getModelById(modelId).supportsStructuredOutput;
  const hasSchema = responseFormat.trim().length > 0;

  return (
    <>
      <FieldRow label="Format">
        <Button
          size="sm"
          variant={hasSchema ? "outline" : "primary"}
          aria-pressed={!hasSchema}
          label="Text"
          onClick={() => onResponseFormatChange("")}
        />
        <Button
          size="sm"
          variant={hasSchema ? "primary" : "outline"}
          aria-pressed={hasSchema}
          label="JSON schema"
          disabled={!supportsStructuredOutput}
          tooltip={
            supportsStructuredOutput
              ? undefined
              : "Pick a specific model that supports structured response format (JSON schema)"
          }
          onClick={() => setIsDialogOpen(true)}
        />
      </FieldRow>
      {hasSchema ? (
        <FieldRow label="Schema">
          <Button
            size="xs"
            variant="outline"
            icon={Edit04}
            label="Edit schema"
            onClick={() => setIsDialogOpen(true)}
          />
          <Button
            size="xs"
            variant="ghost"
            icon={XClose}
            label="Remove"
            onClick={() => onResponseFormatChange("")}
          />
        </FieldRow>
      ) : null}
      <StructuredResponseDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        value={responseFormat}
        onSave={onResponseFormatChange}
      />
    </>
  );
}
