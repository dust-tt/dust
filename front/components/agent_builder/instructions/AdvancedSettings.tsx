import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ModelSelectionSubmenu } from "@app/components/agent_builder/instructions/ModelSelectionSubmenu";
import { ReasoningEffortSubmenu } from "@app/components/agent_builder/instructions/ReasoningEffortSubmenu";
import { SuspensedCodeEditor } from "@app/components/SuspensedCodeEditor";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useModels } from "@app/lib/swr/models";
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
  DocumentTextIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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

export function AdvancedSettings() {
  const { isDark } = useTheme();
  const { owner } = useAgentBuilderContext();
  const { models } = useModels({ owner });
  const { field: modelSettingsField } = useController<
    AgentBuilderFormData,
    "generationSettings.modelSettings"
  >({
    name: "generationSettings.modelSettings",
  });
  const { field: responseFormatField } = useController<
    AgentBuilderFormData,
    "generationSettings.responseFormat"
  >({
    name: "generationSettings.responseFormat",
  });
  const [isResponseFormatDialogOpen, setIsResponseFormatDialogOpen] =
    React.useState(false);
  const [tempResponseFormat, setTempResponseFormat] = React.useState<
    string | null
  >(null);

  if (!models) {
    return null;
  }

  const currentValue = tempResponseFormat ?? responseFormatField.value ?? "";
  const validationError = getResponseFormatError(currentValue);

  const supportsResponseFormat = isSupportingResponseFormat(
    modelSettingsField.value.modelId
  );
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button label="Advanced" variant="outline" size="sm" isSelect />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <ModelSelectionSubmenu models={models} />

          <ReasoningEffortSubmenu models={models} />

          {supportsResponseFormat && (
            <DropdownMenuItem
              label="Structured Response Format"
              onSelect={() => {
                setTimeout(() => {
                  setTempResponseFormat(responseFormatField.value ?? null);
                  setIsResponseFormatDialogOpen(true);
                }, 0);
              }}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isResponseFormatDialogOpen}
        onOpenChange={setIsResponseFormatDialogOpen}
      >
        <DialogContent size="xl" height="lg">
          <DialogHeader>
            <DialogTitle visual={<DocumentTextIcon />}>
              Structured response format
            </DialogTitle>
            <DialogDescription>
              Specify a JSON schema to get responses in a consistent structure
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
                "rounded-lg bg-slate-100 dark:bg-slate-100-night",
                validationError &&
                  "border-2 border-red-500 bg-slate-100 dark:bg-slate-100-night"
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
                setIsResponseFormatDialogOpen(false);
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
                setIsResponseFormatDialogOpen(false);
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
