import {
  cn,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import dynamic from "next/dynamic";
import React from "react";
import { useController } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { isInvalidJson } from "@app/components/agent_builder/utils";
import { useTheme } from "@app/components/sparkle/ThemeContext";

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

export function ResponseFormatSubmenu() {
  const { isDark } = useTheme();
  const { field } = useController<
    AgentBuilderFormData,
    "generationSettings.responseFormat"
  >({
    name: "generationSettings.responseFormat",
  });

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger label="Structured Response Format" />
      <DropdownMenuSubContent className="w-96">
        <CodeEditor
          data-color-mode={isDark ? "dark" : "light"}
          value={field.value ?? ""}
          placeholder={RESPONSE_FORMAT_PLACEHOLDER}
          name="responseFormat"
          onChange={(e) => field.onChange(e.target.value)}
          minHeight={380}
          className={cn(
            "rounded-lg",
            isInvalidJson(field.value)
              ? "border-2 border-red-500 bg-slate-100 dark:bg-slate-100-night"
              : "bg-slate-100 dark:bg-slate-100-night"
          )}
          style={{
            fontSize: 13,
            fontFamily:
              "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
            overflowY: "auto",
            height: "400px",
          }}
          language="json"
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
