import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ModelPicker } from "@app/components/model_picker/ModelPicker";
import { SuspensedCodeEditor } from "@app/components/SuspensedCodeEditor";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { isSupportingResponseFormat } from "@app/types/assistant/assistant";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import { validateResponseFormat } from "@app/types/assistant/models/utils";
import {
  Button,
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  File04,
} from "@dust-tt/sparkle";
import React, { useEffect } from "react";
import { useController } from "react-hook-form";

function getResponseFormatError(value: string): string | null {
  if (value.trim() === "") {
    return null;
  }
  const result = validateResponseFormat(value);
  return result.isValid ? null : result.errorMessage;
}

const RESPONSE_FORMAT_PLACEHOLDER =
  "Example:\n\n" +
  "{\n" +
  '  "type": "json_schema",\n' +
  '  "json_schema": {\n' +
  '    "name": "YourSchemaName",\n' +
  '    "strict": true,\n' +
  '    "schema": {\n' +
  '      "type": "object",\n' +
  '      "properties": {\n' +
  '        "property1":\n' +
  '          { "type":"string" }\n' +
  "      },\n" +
  '      "required": ["property1"],\n' +
  '      "additionalProperties": false\n' +
  "    }\n" +
  "  }\n" +
  "}";

function StructuredResponseFormatDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isDark } = useTheme();

  const { field: responseFormatField } = useController<
    AgentBuilderFormData,
    "generationSettings.responseFormat"
  >({
    name: "generationSettings.responseFormat",
  });

  const [tempResponseFormat, setTempResponseFormat] = React.useState<
    string | null
  >(null);
  const currentValue = tempResponseFormat ?? responseFormatField.value ?? "";
  const validationError = getResponseFormatError(currentValue);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="xl" height="lg">
        <DialogHeader>
          <DialogTitle visual={<File04 />}>
            Structured response format
          </DialogTitle>
          <DialogDescription>
            Specify a JSON schema to get responses in a consistent structure.{" "}
            <a
              href="https://docs.dust.tt/docs/structured-output-format"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              See documentation
            </a>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <SuspensedCodeEditor
            data-color-mode={isDark ? "dark" : "light"}
            value={currentValue}
            placeholder={RESPONSE_FORMAT_PLACEHOLDER}
            name="responseFormat"
            onChange={(e) => setTempResponseFormat(e.target.value)}
            minHeight={400}
            className={cn(
              "rounded-lg bg-primary-100",
              validationError && "border-2 border-red-500 bg-primary-100"
            )}
            style={{
              fontSize: 13,
              fontFamily:
                "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
              overflowY: "auto",
            }}
            language="json"
          />
          {validationError && (
            <p className="text-sm text-red-500">{validationError}</p>
          )}
        </DialogContainer>
        <DialogFooter
          className="pt-2"
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => {
              setTempResponseFormat(null);
              onOpenChange(false);
            },
          }}
          rightButtonProps={{
            label: "Save",
            disabled: !!validationError,
            onClick: () => {
              if (tempResponseFormat !== null) {
                responseFormatField.onChange(tempResponseFormat);
              }
              setTempResponseFormat(null);
              onOpenChange(false);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AdvancedSettings() {
  const { owner } = useAgentBuilderContext();

  const [isResponseFormatDialogOpen, setIsResponseFormatDialogOpen] =
    React.useState(false);

  const { field: generationSettingsField } = useController<
    AgentBuilderFormData,
    "generationSettings"
  >({
    name: "generationSettings",
  });

  const [modelSelection, setModelSelection] = React.useState<
    ModelSelectionType | undefined
  >(undefined);

  useEffect(() => {
    const modelId = generationSettingsField.value.modelSettings?.modelId;
    const providerId = generationSettingsField.value.modelSettings?.providerId;
    const reasoningEffort =
      generationSettingsField.value.reasoningEffort ?? undefined;
    if (!modelId || !providerId) {
      setModelSelection(undefined);
    } else if (
      modelId !== modelSelection?.modelId ||
      providerId !== modelSelection?.providerId ||
      reasoningEffort !== modelSelection?.reasoningEffort
    ) {
      setModelSelection({
        modelId,
        providerId,
        reasoningEffort,
      });
    }
  }, [
    generationSettingsField.value.modelSettings?.modelId,
    generationSettingsField.value.modelSettings?.providerId,
    generationSettingsField.value.reasoningEffort,
    modelSelection?.modelId,
    modelSelection?.providerId,
    modelSelection?.reasoningEffort,
  ]);

  const supportsResponseFormat =
    generationSettingsField.value.modelSettings &&
    isSupportingResponseFormat(
      generationSettingsField.value.modelSettings.modelId
    );

  return (
    <>
      <StructuredResponseFormatDialog
        isOpen={isResponseFormatDialogOpen}
        onOpenChange={setIsResponseFormatDialogOpen}
      />
      <ModelPicker
        // Set these 2 as we are in the context of the agent builder, not a conversation
        agentId={null}
        agentModel={null}
        // Use what is in the agent builder form
        lastRequestedModel={modelSelection ?? null}
        owner={owner}
        buttonSize="sm"
        buttonVariant="outline"
        showLabel={true}
        side="top"
        disabled={false}
        onSelectionChange={(newModelSelection) => {
          // Keep both in sync to avoid extra re-renders
          setModelSelection(newModelSelection);
          generationSettingsField.onChange({
            ...generationSettingsField.value,
            reasoningEffort: newModelSelection?.reasoningEffort,
            modelSettings: {
              modelId: newModelSelection?.modelId,
              providerId: newModelSelection?.providerId,
            },
          });
        }}
      />
      <Button
        label="JSON Response"
        variant="outline"
        size="sm"
        disabled={!supportsResponseFormat}
        tooltip={
          !supportsResponseFormat
            ? "Pick a specific model that supports structured response format (JSON schema)"
            : "Will constrain the model to a specific JSON schema"
        }
        onClick={() => {
          setIsResponseFormatDialogOpen(true);
        }}
      />
    </>
  );
}
