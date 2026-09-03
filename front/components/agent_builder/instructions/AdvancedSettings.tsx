import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ModelPicker } from "@app/components/model_picker/ModelPicker";
import { SuspensedCodeEditor } from "@app/components/SuspensedCodeEditor";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import { isSupportingResponseFormat } from "@app/types/assistant/assistant";
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
import React from "react";
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

  const generationSettings = generationSettingsField.value;
  const agentModel = React.useMemo<AgentModelConfigurationType | null>(() => {
    if (!generationSettings.modelSettings) {
      return null;
    }

    return {
      ...generationSettings.modelSettings,
      temperature: generationSettings.temperature,
      reasoningEffort: generationSettings.reasoningEffort ?? undefined,
    };
  }, [generationSettings]);

  const supportsResponseFormat =
    generationSettings.modelSettings &&
    isSupportingResponseFormat(generationSettings.modelSettings.modelId);

  return (
    <>
      <StructuredResponseFormatDialog
        isOpen={isResponseFormatDialogOpen}
        onOpenChange={setIsResponseFormatDialogOpen}
      />
      <ModelPicker
        agentId={null}
        agentModel={agentModel}
        lastRequestedModel={null}
        owner={owner}
        buttonSize="sm"
        buttonVariant="outline"
        showLabel={true}
        side="top"
        disabled={false}
        showDegradations={false}
        onSelectionChange={(newModelSelection) => {
          generationSettingsField.onChange({
            ...generationSettings,
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
