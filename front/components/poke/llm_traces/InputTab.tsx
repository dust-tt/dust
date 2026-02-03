import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import type { ComponentProps } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { LLMTraceInput } from "@app/lib/api/llm/traces/types";
import type {
  Content,
  FunctionCallType,
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActionsWithoutContentFragment,
} from "@app/types";
import { isString, isTextContent } from "@app/types";
import {
  isAgentFunctionCallContent,
  isAgentTextContent,
} from "@app/types/assistant/agent_message_content";

interface ContentArrayViewProps {
  content: Content[];
}

function ContentArrayView({ content }: ContentArrayViewProps) {
  return (
    <div className="space-y-1">
      {content.map((c, i) =>
        isTextContent(c) ? (
          <pre key={i} className="whitespace-pre-wrap text-sm">
            {c.text}
          </pre>
        ) : (
          <div
            key={i}
            className="text-sm text-muted-foreground dark:text-muted-foreground-night"
          >
            [Image: {c.image_url.url.slice(0, 50)}...]
          </div>
        )
      )}
    </div>
  );
}

interface FunctionCallCardProps {
  functionCall: FunctionCallType;
}

function ToolCallCard({ functionCall }: FunctionCallCardProps) {
  const { isDark } = useTheme();

  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(functionCall.arguments);
  } catch {
    parsedArgs = functionCall.arguments;
  }

  return (
    <div className="rounded border p-3">
      <div className="mb-2">
        <Chip
          color="green"
          size="xs"
          label={`tool_call: ${functionCall.name}`}
        />
      </div>
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

interface MessageContentProps {
  message: ModelMessageTypeMultiActionsWithoutContentFragment;
}

function MessageContent({ message }: MessageContentProps) {
  const { isDark } = useTheme();

  switch (message.role) {
    case "user":
      return <ContentArrayView content={message.content} />;

    case "assistant": {
      const textContents = message.contents.filter(isAgentTextContent);
      const functionCalls = message.contents
        .filter(isAgentFunctionCallContent)
        .map((c) => c.value);

      return (
        <div className="space-y-2">
          {textContents.map((c, i) => (
            <pre key={i} className="whitespace-pre-wrap text-sm">
              {c.value}
            </pre>
          ))}
          {functionCalls.map((fc, i) => (
            <ToolCallCard key={i} functionCall={fc} />
          ))}
        </div>
      );
    }

    case "function": {
      if (isString(message.content)) {
        let parsed;
        try {
          parsed = JSON.parse(message.content);
        } catch {
          parsed = null;
        }
        if (parsed) {
          return (
            <JsonViewer
              theme={isDark ? "dark" : "light"}
              value={parsed}
              rootName={false}
              defaultInspectDepth={2}
              className="p-2"
            />
          );
        }
        return (
          <pre className="whitespace-pre-wrap text-sm">{message.content}</pre>
        );
      }
      return <ContentArrayView content={message.content} />;
    }
  }
}

interface ConversationViewProps {
  conversation: ModelConversationTypeMultiActions;
}

function ConversationView({ conversation }: ConversationViewProps) {
  const roleChipColors: Record<string, ComponentProps<typeof Chip>["color"]> = {
    user: "blue",
    assistant: "green",
    function: "golden",
  };

  return (
    <div className="space-y-2">
      {conversation.messages.map((message, index) => {
        const chipColor = roleChipColors[message.role] ?? "primary";
        const roleName =
          message.role === "function"
            ? `tool_result: ${message.name}`
            : message.role;

        return (
          <div key={index} className="rounded border p-3">
            <div className="mb-2">
              <Chip color={chipColor} size="xs" label={roleName} />
            </div>
            <MessageContent message={message} />
          </div>
        );
      })}
    </div>
  );
}

interface SpecificationCardProps {
  spec: LLMTraceInput["specifications"][number];
}

function SpecificationCard({ spec }: SpecificationCardProps) {
  const { isDark } = useTheme();

  return (
    <div className="rounded-lg border p-3">
      <JsonViewer
        theme={isDark ? "dark" : "light"}
        value={spec}
        rootName={false}
        defaultInspectDepth={1}
        className="p-2"
      />
    </div>
  );
}

interface InputTabProps {
  input: LLMTraceInput;
}

export function InputTab({ input }: InputTabProps) {
  return (
    <div className="space-y-4 pt-4">
      {input.prompt && (
        <div className="rounded-lg border p-4">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger>
              <h3 className="text-lg font-medium">
                System Prompt ({input.prompt.length.toLocaleString()} chars)
              </h3>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 max-h-125 overflow-auto">
                <pre className="whitespace-pre-wrap text-sm">
                  {input.prompt}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
      {input.specifications.length > 0 && (
        <div className="rounded-lg border p-4">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger>
              <h3 className="text-lg font-medium">
                Specifications ({input.specifications.length})
              </h3>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 space-y-3">
                {input.specifications.map((spec, index) => (
                  <SpecificationCard key={index} spec={spec} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
      <div className="rounded-lg border p-4">
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>
            <h3 className="text-lg font-medium">
              Conversation ({input.conversation.messages.length} messages)
            </h3>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-4">
              <ConversationView conversation={input.conversation} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
