import { useTheme } from "@app/components/sparkle/ThemeContext";
import { isString } from "@app/types/shared/utils/general";
import { Chip } from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";

interface ToolCallData {
  id: string;
  name: string;
  arguments: string | Record<string, unknown>;
}

interface ToolCallCardProps {
  toolCall: ToolCallData;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const { isDark } = useTheme();

  let parsedArgs: unknown;
  if (isString(toolCall.arguments)) {
    try {
      parsedArgs = JSON.parse(toolCall.arguments);
    } catch {
      parsedArgs = toolCall.arguments;
    }
  } else {
    parsedArgs = toolCall.arguments;
  }

  return (
    <div className="rounded border p-3">
      <Chip
        color="green"
        size="xs"
        label={`tool_call: ${toolCall.name}`}
        className="mb-2"
      />
      <JsonViewer
        theme={isDark ? "dark" : "light"}
        value={parsedArgs}
        rootName={false}
        defaultInspectDepth={2}
        className="p-2"
      />
    </div>
  );
}

interface ToolCallsViewProps {
  toolCalls: ToolCallData[];
}

export function ToolCallsView({ toolCalls }: ToolCallsViewProps) {
  return (
    <div className="space-y-3">
      {toolCalls.map((toolCall, index) => (
        <ToolCallCard key={index} toolCall={toolCall} />
      ))}
    </div>
  );
}
