import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { LLMTraceOutput } from "@app/lib/api/llm/traces/types";
import { isString } from "@app/types";

interface ToolCallsViewProps {
  toolCalls: NonNullable<LLMTraceOutput["toolCalls"]>;
}

function ToolCallsView({ toolCalls }: ToolCallsViewProps) {
  const { isDark } = useTheme();

  return (
    <div className="space-y-3">
      {toolCalls.map((toolCall, index) => (
        <div key={index} className="rounded border p-3">
          <div className="mb-2">
            <Chip color="green" size="xs" label={`tool_call: ${toolCall.name}`} />
          </div>
          <JsonViewer
            theme={isDark ? "dark" : "light"}
            value={toolCall.arguments}
            rootName={false}
            defaultInspectDepth={2}
          />
        </div>
      ))}
    </div>
  );
}

interface OutputTabProps {
  output: LLMTraceOutput | undefined;
}

export function OutputTab({ output }: OutputTabProps) {
  if (!output) {
    return (
      <p className="pt-4 text-sm italic text-muted-foreground dark:text-muted-foreground-night">
        No output available
      </p>
    );
  }

  const hasContent =
    isString(output.content)  ||
    isString(output.reasoning) ||
    (output.toolCalls && output.toolCalls.length > 0);

  if (!hasContent) {
    return (
      <p className="pt-4 text-sm italic text-muted-foreground dark:text-muted-foreground-night">
        No output content
      </p>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      {isString(output.content) && (
        <div className="rounded-lg border p-4">
          <Collapsible defaultOpen={true}>
            <CollapsibleTrigger>
              <h3 className="text-lg font-medium">
                Content ({output.content.length.toLocaleString()} chars)
              </h3>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 max-h-125 overflow-auto">
                <pre className="whitespace-pre-wrap text-sm">
                  {output.content}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
      {isString(output.reasoning) && (
        <div className="rounded-lg border p-4">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger>
              <h3 className="text-lg font-medium">
                Reasoning ({output.reasoning.length.toLocaleString()} chars)
              </h3>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 max-h-125 overflow-auto">
                <pre className="whitespace-pre-wrap text-sm">
                  {output.reasoning}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
      {output.toolCalls && output.toolCalls.length > 0 && (
        <div className="rounded-lg border p-4">
          <Collapsible defaultOpen={true}>
            <CollapsibleTrigger>
              <h3 className="text-lg font-medium">
                Tool Calls ({output.toolCalls.length})
              </h3>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4">
                <ToolCallsView toolCalls={output.toolCalls} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
