import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  Card,
  ContentMessage,
  Icon,
  Lightbulb04,
  Markdown,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type {
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { useMemo } from "react";

export function MCPAgentMemoryRetrieveActionDetails({
  toolOutput,
  displayContext,
}: ToolExecutionDetailsProps) {
  const { t } = useLingui();
  const parsedMemories = useMemo(
    () => parseMemoriesFromOutput(toolOutput),
    [toolOutput]
  );

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={t`Retrieve agent memory`}
      visual={Lightbulb04}
    >
      <div className="flex flex-col pt-4">
        <div className="flex flex-col gap-2">
          <span className="heading-base">
            <Trans>Saved memories</Trans>
          </span>
          {parsedMemories.length === 0 ? (
            <ActionCard actionText={`*${t`No memory was retrieved.`}*`} />
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
  displayContext,
}: ToolExecutionDetailsProps) {
  const { t } = useLingui();
  const entries = Array.isArray(toolParams.entries) ? toolParams.entries : [];
  const entryCount = entries.length;
  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={t`Record agent memory`}
      visual={Lightbulb04}
    >
      <div className="flex flex-col pt-4">
        <div className="flex flex-col gap-2">
          <span className="heading-base">
            {t`${plural(entryCount, { one: "Recorded memory", other: "Recorded memories" })}`}
          </span>
          {entries.length === 0 ? (
            <ActionCard actionText={`*${t`No entries were recorded.`}*`} />
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
  displayContext,
  toolName,
}: ToolExecutionDetailsProps & { toolName: string }) {
  const { t } = useLingui();
  const updatedMemories = useMemo(
    () => parseMemoriesFromOutput(toolOutput),
    [toolOutput]
  );
  const toolNameText =
    toolName === "compact_memory"
      ? t`Compact agent memory`
      : t`Edit agent memory`;
  const subTitleText =
    toolName === "compact_memory" ? t`Compacted memories` : t`Edited memories`;
  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={toolNameText}
      visual={Lightbulb04}
    >
      <div className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-2">
          <div className="heading-base">{subTitleText}</div>
          {updatedMemories.length === 0 ? (
            <ActionCard actionText={`*${t`No memories remaining.`}*`} />
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
  displayContext,
}: ToolExecutionDetailsProps) {
  const { t } = useLingui();
  const indexes = Array.isArray(toolParams.indexes) ? toolParams.indexes : [];
  const erasedCount = indexes.length;
  const remainingMemories = useMemo(
    () => parseMemoriesFromOutput(toolOutput),
    [toolOutput]
  );
  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={t`Erase agent memory`}
      visual={Lightbulb04}
    >
      <div className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-2">
          <span className="heading-base">
            <Trans>Output</Trans>
          </span>
          <ActionCard
            actionText={
              indexes.length === 0
                ? `*${t`No memory entries were erased.`}*`
                : `*${t`${plural(erasedCount, { one: "Erased # memory.", other: "Erased # memories." })}`}*`
            }
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="heading-base">
            <Trans>Remaining memories</Trans>
          </div>
          {remainingMemories.length === 0 ? (
            <ActionCard actionText={`*${t`No memories remaining.`}*`} />
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
            <Icon visual={Lightbulb04} size="xs" />
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
