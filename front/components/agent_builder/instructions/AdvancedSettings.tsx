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
import dynamic from "next/dynamic";
import React from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ModelSelectionSubmenu } from "@app/components/agent_builder/instructions/ModelSelectionSubmenu";
import { ReasoningEffortSubmenu } from "@app/components/agent_builder/instructions/ReasoningEffortSubmenu";
import { isInvalidJson } from "@app/components/agent_builder/utils";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useModels } from "@app/lib/swr/models";
import { isSupportingResponseFormat } from "@app/types";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

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

          <ReasoningEffortSubmenu />

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
            <CodeEditor
              data-color-mode={isDark ? "dark" : "light"}
              value={tempResponseFormat ?? responseFormatField.value ?? ""}
              placeholder={RESPONSE_FORMAT_PLACEHOLDER}
              name="responseFormat"
              onChange={(e) => setTempResponseFormat(e.target.value)}
              minHeight={450}
              className={cn(
                "rounded-lg bg-slate-100 dark:bg-slate-100-night",
                isInvalidJson(
                  tempResponseFormat ?? responseFormatField.value
                ) &&
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
