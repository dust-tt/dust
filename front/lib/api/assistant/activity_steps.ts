import {
  AgentMessageContentParser,
  getCoTDelimitersConfiguration,
} from "@app/lib/llms/agent_message_content_parser";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  AgentMessageContentView,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
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
  if (
    action.internalMCPServerName === "sandbox" &&
    action.toolName === "add_egress_domain" &&
    typeof action.params?.domain === "string"
  ) {
    return context === "running"
      ? `Requesting access to ${action.params.domain}`
      : `Request access to ${action.params.domain}`;
  }

  return (
    action.displayLabels?.[context] ??
    (action.functionCallName ? asDisplayName(action.functionCallName) : "Tool")
  );
}

// Ensure at least one whitespace boundary between adjacent text fragments when
// reconstructing content from step contents. If neither the previous fragment
// ends with whitespace nor the next fragment starts with whitespace, insert a
// single "\n" between them. This avoids words being concatenated across step
// boundaries without altering content that already contains spacing.
function interleaveConditionalNewlines(parts: string[]): string[] {
  if (parts.length === 0) {
    return [];
  }
  const out: string[] = [];
  out.push(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1];
    const curr = parts[i];
    const prevLast = prev.length ? prev[prev.length - 1] : "";
    const currFirst = curr.length ? curr[0] : "";
    const prevEndsWs = /\s/.test(prevLast);
    const currStartsWs = /\s/.test(currFirst);
    if (!prevEndsWs && !currStartsWs) {
      out.push("\n");
    }
    out.push(curr);
  }
  return out;
}

/**
 * Compute the full display state of an agent message from its ordered contents:
 * the answer body, the chain of thought, and the inline activity steps. This is
 * the single source of truth for the body/steps boundary rule, shared by reload
 * (server render) and the terminal streaming events (so live matches reload).
 *
 * `activitySteps` mirrors the parsing logic in AgentActionsPanel (side panel)
 * but produces `InlineActivityStep[]` with labels only — no full action objects.
 */
export async function renderAgentMessageContentView(
  contents: Array<{ step: number; content: AgentContentItemType }>,
  actions: AgentMCPActionWithOutputType[],
  agentConfiguration: LightAgentConfigurationType,
  messageId: string
): Promise<AgentMessageContentView> {
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

  const activitySteps: InlineActivityStep[] = [];

  for (const [index, c] of contents.entries()) {
    if (isAgentReasoningContent(c.content)) {
      const reasoning = c.content.value.reasoning;
      if (reasoning?.trim()) {
        activitySteps.push({
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
        messageId,
        getCoTDelimitersConfiguration({ agentConfiguration })
      );
      const parsedContent = await contentParser.parseContents([
        c.content.value,
      ]);

      if (parsedContent.chainOfThought?.trim()) {
        activitySteps.push({
          type: "thinking",
          content: parsedContent.chainOfThought,
          id: `cot-${c.step}-${index}`,
        });
      }

      // Create a content step for every intermediate text segment.
      // The last text_content stays as the message body and is not a step.
      if (index !== lastTextContentIndex && parsedContent.content?.trim()) {
        activitySteps.push({
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
        activitySteps.push({
          type: "action",
          label: getActionOneLineLabel(matchingAction),
          id: `action-${matchingAction.id}`,
          actionId: matchingAction.sId,
          internalMCPServerName: matchingAction.internalMCPServerName,
          toolName: matchingAction.toolName ?? null,
        });
      }
    }
  }

  const { content, chainOfThought } = await selectBodyAndChainOfThought(
    contents,
    agentConfiguration,
    messageId
  );

  return { content, chainOfThought, activitySteps };
}

// Body = the last text fragment (final answer); chain of thought = native
// reasoning when present, otherwise the parsed CoT from the text fragments.
// This branching is preserved exactly from the previous reload implementation
// (messages.ts) so live === reload.
async function selectBodyAndChainOfThought(
  contents: Array<{ step: number; content: AgentContentItemType }>,
  agentConfiguration: LightAgentConfigurationType,
  messageId: string
): Promise<{ content: string | null; chainOfThought: string | null }> {
  const reasoningValues: Array<string | undefined> = [];
  const textValues: string[] = [];
  for (const c of contents) {
    if (isAgentReasoningContent(c.content)) {
      reasoningValues.push(c.content.value.reasoning);
    } else if (isAgentTextContent(c.content)) {
      textValues.push(c.content.value);
    }
  }

  const textFragments = interleaveConditionalNewlines(textValues);

  if (reasoningValues.length > 0) {
    return {
      // For multiple steps outputting text content, we want to display only the
      // last one as the final answer.
      content:
        textFragments.length > 0 ? textFragments[textFragments.length - 1] : "",
      chainOfThought: reasoningValues
        .filter((r): r is string => !!r)
        .join("\n\n"),
    };
  }

  const contentParser = new AgentMessageContentParser(
    agentConfiguration,
    messageId,
    getCoTDelimitersConfiguration({ agentConfiguration })
  );
  const parsedContent = await contentParser.parseContents(textFragments);
  return {
    content: parsedContent.content,
    chainOfThought: parsedContent.chainOfThought,
  };
}
