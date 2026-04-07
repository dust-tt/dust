import {
  isSearchInputType,
  isWebsearchInputType,
} from "@app/lib/actions/mcp_internal_actions/types";
import {
  AgentMessageContentParser,
  getCoTDelimitersConfiguration,
} from "@app/lib/llms/agent_message_content_parser";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";
import {
  isAgentFunctionCallContent,
  isAgentReasoningContent,
  isAgentTextContent,
} from "@app/types/assistant/agent_message_content";
import type { InlineActivityStep } from "@app/types/assistant/conversation";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

const MAX_QUERY_DISPLAY_LENGTH = 60;

function truncateQuery(query: string): string {
  return query.length > MAX_QUERY_DISPLAY_LENGTH
    ? query.slice(0, MAX_QUERY_DISPLAY_LENGTH) + "…"
    : query;
}

function getQueryLabel(action: AgentMCPActionWithOutputType): string | null {
  if (action.toolName === "websearch" && isWebsearchInputType(action.params)) {
    return truncateQuery(action.params.query);
  }
  if (
    action.toolName === "semantic_search" &&
    isSearchInputType(action.params)
  ) {
    return truncateQuery(action.params.query);
  }
  return null;
}

/**
 * Compute the display label for an action (one-line summary).
 * Pure function with no browser dependencies — usable server-side and client-side.
 */
export function getActionOneLineLabel(
  action: AgentMCPActionWithOutputType,
  context: "running" | "done" = "done"
): string {
  const queryLabel = getQueryLabel(action);
  if (queryLabel) {
    return context === "running"
      ? `Searching "${queryLabel}"`
      : `Searched "${queryLabel}"`;
  }

  if (action.displayLabels) {
    return action.displayLabels[context];
  }
  return action.functionCallName
    ? asDisplayName(action.functionCallName)
    : "Tool";
}

/**
 * Convert an agent message's contents array into a flat list of lightweight
 * activity steps suitable for the inline activity timeline.
 *
 * This mirrors the parsing logic in AgentActionsPanel (side panel) but produces
 * `InlineActivityStep[]` with labels only — no full action objects.
 */
export async function contentsToActivitySteps(
  contents: Array<{ step: number; content: AgentContentItemType }>,
  actions: AgentMCPActionWithOutputType[],
  agentConfiguration: LightAgentConfigurationType,
  messageSId: string
): Promise<InlineActivityStep[]> {
  const actionsByCallId = new Map(actions.map((a) => [a.functionCallId, a]));

  // Find the last text_content index — that item stays as the message body
  // and should NOT become a content activity step.
  let lastTextContentIndex = -1;
  for (let i = contents.length - 1; i >= 0; i--) {
    if (isAgentTextContent(contents[i].content)) {
      lastTextContentIndex = i;
      break;
    }
  }

  const steps: InlineActivityStep[] = [];

  for (const [index, c] of contents.entries()) {
    if (isAgentReasoningContent(c.content)) {
      const reasoning = c.content.value.reasoning;
      if (reasoning?.trim()) {
        steps.push({
          type: "thinking",
          content: reasoning,
          id: `reasoning-${c.step}-${index}`,
        });
      }
      continue;
    }

    if (isAgentTextContent(c.content)) {
      const contentParser = new AgentMessageContentParser(
        agentConfiguration,
        messageSId,
        getCoTDelimitersConfiguration({ agentConfiguration })
      );
      const parsedContent = await contentParser.parseContents([
        c.content.value,
      ]);

      if (parsedContent.chainOfThought?.trim()) {
        steps.push({
          type: "thinking",
          content: parsedContent.chainOfThought,
          id: `cot-${c.step}-${index}`,
        });
      }

      // Create a content step for every intermediate text segment.
      // The last text_content stays as the message body and is not a step.
      if (index !== lastTextContentIndex && parsedContent.content?.trim()) {
        steps.push({
          type: "content",
          content: parsedContent.content,
          id: `content-${c.step}-${index}`,
        });
      }
      continue;
    }

    if (isAgentFunctionCallContent(c.content)) {
      const functionCallId = c.content.value.id;
      const matchingAction = actionsByCallId.get(functionCallId);

      if (matchingAction) {
        steps.push({
          type: "action",
          label: getActionOneLineLabel(matchingAction),
          id: `action-${matchingAction.id}`,
          actionId: matchingAction.sId,
          internalMCPServerName: matchingAction.internalMCPServerName,
        });
      }
    }
  }

  return steps;
}
