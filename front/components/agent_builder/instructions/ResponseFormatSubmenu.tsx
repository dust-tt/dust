import {
  cn,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import dynamic from "next/dynamic";
import React from "react";

import type { GenerationSettingsType } from "@app/components/agent_builder/types";
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

interface ResponseFormatSubmenuProps {
  generationSettings: GenerationSettingsType;
  setGenerationSettings: (generationSettings: GenerationSettingsType) => void;
}

export function ResponseFormatSubmenu({
  generationSettings,
  setGenerationSettings,
}: ResponseFormatSubmenuProps) {
  const { isDark } = useTheme();

  const handleResponseFormatChange = (value: string) => {
    setGenerationSettings({
      ...generationSettings,
      responseFormat: value,
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger label="Structured Response Format" />
      <DropdownMenuSubContent className="w-96">
        <CodeEditor
          data-color-mode={isDark ? "dark" : "light"}
          value={generationSettings?.responseFormat ?? ""}
          placeholder={RESPONSE_FORMAT_PLACEHOLDER}
          name="responseFormat"
          onChange={(e) => handleResponseFormatChange(e.target.value)}
          minHeight={380}
          className={cn(
            "rounded-lg",
            isInvalidJson(generationSettings?.responseFormat)
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
