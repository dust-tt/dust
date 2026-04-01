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

/**
 * Compute the display label for an action (one-line summary).
 * Pure function with no browser dependencies — usable server-side and client-side.
 */
export function getActionOneLineLabel(
  action: AgentMCPActionWithOutputType,
  context: "running" | "done" = "done"
): string {
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
          serverIcon: matchingAction.serverIcon,
        });
      }
    }
  }

  return steps;
}
