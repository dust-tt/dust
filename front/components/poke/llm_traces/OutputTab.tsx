import { JsonViewer } from "@textea/json-viewer";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { LLMTraceOutput } from "@app/lib/api/llm/traces/types";

interface ToolCallsViewProps {
  toolCalls: NonNullable<LLMTraceOutput["toolCalls"]>;
}

function ToolCallsView({ toolCalls }: ToolCallsViewProps) {
  const { isDark } = useTheme();

  return (
    <div className="space-y-3">
      {toolCalls.map((toolCall, index) => (
        <div key={index} className="rounded-lg border p-4">
          <div className="mb-2 flex items-center gap-2">
            <code className="rounded bg-purple-100 px-2 py-0.5 text-sm font-semibold dark:bg-purple-900">
              {toolCall.name}
            </code>
            <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              ID: {toolCall.id}
            </span>
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
    output.content !== undefined ||
    output.reasoning !== undefined ||
    (output.toolCalls && output.toolCalls.length > 0);

  if (!hasContent) {
    return (
      <p className="pt-4 text-sm italic text-muted-foreground dark:text-muted-foreground-night">
        No output content
      </p>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {output.content && (
        <div>
          <h3 className="mb-2 text-lg font-medium">Content</h3>
          <pre className="whitespace-pre-wrap text-sm">
            {output.content}
          </pre>
        </div>
      )}
      {output.reasoning && (
        <div>
          <h3 className="mb-2 text-lg font-medium">Reasoning</h3>
          <pre className="whitespace-pre-wrap text-sm">
            {output.reasoning}
          </pre>
        </div>
      )}
      {output.toolCalls && output.toolCalls.length > 0 && (
        <div>
          <h3 className="mb-2 text-lg font-medium">
            Tool Calls ({output.toolCalls.length})
          </h3>
          <ToolCallsView toolCalls={output.toolCalls} />
        </div>
      )}
    </div>
  );
}
