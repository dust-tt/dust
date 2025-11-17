import {
  ActionLightbulbIcon,
  Card,
  ContentMessage,
  Icon,
  Markdown,
} from "@dust-tt/sparkle";
import type {
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { useMemo } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";

export function MCPAgentMemoryRetrieveActionDetails({
  toolOutput,
  viewType,
}: ToolExecutionDetailsProps) {
  const parsedMemories = useMemo(
    () => parseMemoriesFromOutput(toolOutput),
    [toolOutput]
  );

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName="Retrieve Agent Memory"
      visual={ActionLightbulbIcon}
    >
      <div className="flex flex-col pt-4">
        <div className="flex flex-col gap-2">
          <span className="heading-base">Saved memories</span>
          {parsedMemories.length === 0 ? (
            <ActionCard actionText={"*No memory was retrieved.*"} />
          ) : (
            <MemoriesCardList memories={parsedMemories} />
          )}
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

export function MCPAgentMemoryRecordActionDetails({
  toolParams,
  viewType,
}: ToolExecutionDetailsProps) {
  const entries = Array.isArray(toolParams.entries) ? toolParams.entries : [];
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName="Record Agent Memory"
      visual={ActionLightbulbIcon}
    >
      <div className="flex flex-col pt-4">
        <div className="flex flex-col gap-2">
          <span className="heading-base">
            {entries.length === 1 ? "Recorded memory" : "Recorded memories"}
          </span>
          {entries.length === 0 ? (
            <ActionCard actionText={"*No entries were recorded.*"} />
          ) : (
            <MemoriesCardList memories={entries} />
          )}
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

export function MCPAgentMemoryEditActionDetails({
  toolOutput,
  viewType,
  toolName,
}: ToolExecutionDetailsProps & { toolName: string }) {
  const updatedMemories = useMemo(
    () => parseMemoriesFromOutput(toolOutput),
    [toolOutput]
  );
  const toolNameText =
    toolName === "compact_memory"
      ? "Compact Agent Memory"
      : "Edit Agent Memory";
  const subTitleText =
    toolName === "compact_memory" ? "Compacted memories" : "Edited memories";
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={toolNameText}
      visual={ActionLightbulbIcon}
    >
      <div className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-2">
          <div className="heading-base">{subTitleText}</div>
          {updatedMemories.length === 0 ? (
            <ActionCard actionText={"*No memories remaining.*"} />
          ) : (
            <MemoriesCardList memories={updatedMemories} />
          )}
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

export function MCPAgentMemoryEraseActionDetails({
  toolParams,
  toolOutput,
  viewType,
}: ToolExecutionDetailsProps) {
  const indexes = Array.isArray(toolParams.indexes) ? toolParams.indexes : [];
  const remainingMemories = useMemo(
    () => parseMemoriesFromOutput(toolOutput),
    [toolOutput]
  );
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName="Erase Agent Memory"
      visual={ActionLightbulbIcon}
    >
      <div className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-2">
          <span className="heading-base">Output</span>
          <ActionCard
            actionText={
              indexes.length === 0
                ? "*No memory entries were erased.*"
                : `*Erased ${indexes.length} ${indexes.length === 1 ? "memory" : "memories"}.*`
            }
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="heading-base">Remaining memories</div>
          {remainingMemories.length === 0 ? (
            <ActionCard actionText={"*No memories remaining.*"} />
          ) : (
            <MemoriesCardList memories={remainingMemories} />
          )}
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

/**
 * Shared components & utils.
 */

const MemoriesCardList = ({ memories }: { memories: string[] }) => {
  return (
    <div className="flex flex-col gap-1">
      {memories.map((memory, index) => (
        <Card key={index} size="md" className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Icon visual={ActionLightbulbIcon} size="xs" />
            <div className="text-sm">{memory}</div>
          </div>
        </Card>
      ))}
    </div>
  );
};

const ActionCard = ({ actionText }: { actionText: string }) => {
  return (
    <ContentMessage variant="primary" size="lg">
      <Markdown content={actionText} forcedTextSize="text-sm" />
    </ContentMessage>
  );
};

function parseMemoriesFromOutput(
  toolOutput: CallToolResult["content"] | null
): string[] {
  const memoryOutputs =
    toolOutput?.filter(
      (output): output is TextContent => output.type === "text"
    ) ?? [];

  const memories: string[] = [];

  memoryOutputs.forEach((output) => {
    if (output.text === "(memory empty)") {
      return;
    }
    const lines = output.text.split("\n");
    lines.forEach((line: string) => {
      const match = line.match(/^\[\d+\]\s*(.+)$/);
      if (match) {
        memories.push(match[1].trim());
      } else if (line.trim()) {
        memories.push(line.trim());
      }
    });
  });

  return memories;
}
