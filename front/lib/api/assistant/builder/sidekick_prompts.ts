import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { renderConversationAsTextWithFeedback } from "@app/lib/api/assistant/conversation/render_conversation_with_feedback";
import type { AgentMessageFeedbackWithMetadataType } from "@app/lib/api/assistant/feedback";
import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { TemplateResource } from "@app/lib/resources/template_resource";
import logger from "@app/logger/logger";
import { ConversationError } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const FEEDBACK_LIMIT = 50;
const OLDER_FEEDBACK_LIMIT = 10;
const OLDER_FEEDBACK_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 3 months
const INSIGHTS_DAYS = 30;
const MAX_PENDING_SUGGESTIONS_IN_FIRST_MESSAGE = 20;

// ─── Template prompt ─────────────────────────────────────────────────────

export function buildTemplatePrompt({
  handle,
  sidekickInstructions,
  agentFacingDescription,
}: TemplateResource): string {
  return `<dust_system>
The user is creating a new agent based on the "${handle}" template.
NEVER call \`get_agent_config\` in this first message.
Here is a brief description of what the agent should do:

<description>
${agentFacingDescription}
</description>

Follow the <using_templates> section from your instructions to act on the sidekickInstructions below.

<sidekickInstructions>
${sidekickInstructions}
</sidekickInstructions>
</dust_system>`;
}

// ─── Existing-agent prompt ───────────────────────────────────────────────

function buildExistingAgentMessage({
  feedbackMarkdown,
  insightsMarkdown,
  pendingSuggestions,
}: {
  feedbackMarkdown: string | null;
  insightsMarkdown: string | null;
  pendingSuggestions: Array<{ sId: string; kind: string }>;
}): string {
  const dataSections = [feedbackMarkdown, insightsMarkdown]
    .filter(Boolean)
    .join("\n\n");

  const suggestionDirectives =
    pendingSuggestions.length > 0 &&
    pendingSuggestions
      .map((s) => `:agent_suggestion[]{sId=${s.sId} kind=${s.kind}}`)
      .join("\n");

  const pendingSuggestionsSection = suggestionDirectives
    ? `
<pending_suggestions>
Output these directives verbatim so the suggestion cards render:
${suggestionDirectives}
</pending_suggestions>`
    : "";

  return `<dust_system>
This is an existing agent.

## Opening message
Do NOT call \`get_agent_config\` in this first message. Based only on the information provided in <existing_agent_data_section>:
- If pending suggestions exist (see <pending_suggestions> below), output their directives to render them as cards.
- If negative feedback patterns exist in the current agent version, mention it as the top issue. Feedback from previous versions are provided for reference, but should not be mentioned in the opening message.

In addition, ask the user if you should suggest additional improvements or if there is something specific they'd like to work on.
Keep the first message to 1–2 sentences (plus any suggestion cards from <pending_suggestions>). Response must fit in the sidekick panel without scrolling.
Do not make assumptions about the users's intent. Given that this is an existing agent, the user is likely to be asking for specific improvements or to work on a specific issue.

<existing_agent_data_section>
${dataSections ? `\n${dataSections}\n` : ""}
</existing_agent_data_section>
${pendingSuggestionsSection}
</dust_system>`;
}

function formatFeedbackItem(f: AgentMessageFeedbackWithMetadataType): string {
  const direction = f.thumbDirection === "up" ? "POSITIVE" : "NEGATIVE";
  const content = f.content ? `: ${f.content}` : "";
  return `- [${direction}]${content}`;
}

function appendFeedbackSection(
  lines: string[],
  title: string,
  items: AgentMessageFeedbackWithMetadataType[]
): void {
  if (items.length === 0) {
    return;
  }
  const positive = items.filter((f) => f.thumbDirection === "up").length;
  const negative = items.filter((f) => f.thumbDirection === "down").length;
  lines.push(
    "",
    `${title} (${items.length} total, ${positive} positive, ${negative} negative):`
  );
  for (const f of items) {
    lines.push(formatFeedbackItem(f));
  }
}

async function fetchFeedbackMarkdown(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<string | null> {
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });

  if (!agentConfiguration) {
    return null;
  }

  const currentVersion = agentConfiguration.version;

  const feedbacksRes = await getAgentFeedbacks({
    auth,
    agentConfigurationId,
    withMetadata: true,
    paginationParams: {
      limit: FEEDBACK_LIMIT,
      orderColumn: "id",
      orderDirection: "desc",
    },
    filter: "active",
  });

  if (feedbacksRes.isErr()) {
    logger.warn(
      { err: feedbacksRes.error },
      "Failed to fetch feedback for sidekick first message"
    );
    return null;
  }

  const feedbacks = feedbacksRes.value.filter(
    (f): f is AgentMessageFeedbackWithMetadataType => true
  );

  if (feedbacks.length === 0) {
    return null;
  }

  const latestVersionFeedback = feedbacks.filter(
    (f) => f.agentConfigurationVersion === currentVersion
  );

  const cutoffMs = Date.now() - OLDER_FEEDBACK_MAX_AGE_MS;
  const olderFeedback = feedbacks
    .filter(
      (f) =>
        f.agentConfigurationVersion !== currentVersion &&
        new Date(f.createdAt).getTime() >= cutoffMs
    )
    .slice(0, OLDER_FEEDBACK_LIMIT);

  if (latestVersionFeedback.length === 0 && olderFeedback.length === 0) {
    return null;
  }

  const lines = ["<feedback>"];
  appendFeedbackSection(
    lines,
    `Current version (v${currentVersion})`,
    latestVersionFeedback
  );
  appendFeedbackSection(lines, "Previous versions", olderFeedback);
  lines.push("</feedback>");
  return lines.join("\n");
}

async function fetchInsightsMarkdown(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<string | null> {
  const owner = auth.getNonNullableWorkspace();
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    agentId: agentConfigurationId,
    days: INSIGHTS_DAYS,
  });

  const overviewResult = await fetchAgentOverview(baseQuery, INSIGHTS_DAYS);

  if (overviewResult.isErr()) {
    logger.warn(
      { err: overviewResult.error },
      "Failed to fetch insights for sidekick first message"
    );
    return null;
  }

  const o = overviewResult.value;
  return [
    "<insights>",
    `Period: last ${INSIGHTS_DAYS} days`,
    `Active users: ${o.activeUsers}`,
    `Conversations: ${o.conversationCount}`,
    `Messages: ${o.messageCount}`,
    `Feedback: ${o.positiveFeedbacks} positive, ${o.negativeFeedbacks} negative`,
    "</insights>",
  ].join("\n");
}

/**
 * Builds the sidekick first-message for an existing agent. Fetches feedback,
 * insights, and pending suggestions in parallel and assembles them into the
 * dust_system prompt.
 */
export async function buildExistingAgentPrompt(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<string> {
  const [feedbackMarkdown, insightsMarkdown, pendingSuggestions] =
    await Promise.all([
      fetchFeedbackMarkdown(auth, agentConfigurationId),
      fetchInsightsMarkdown(auth, agentConfigurationId),
      AgentSuggestionResource.listByAgentConfigurationId(
        auth,
        agentConfigurationId,
        {
          states: ["pending"],
          limit: MAX_PENDING_SUGGESTIONS_IN_FIRST_MESSAGE,
        }
      ),
    ]);

  return buildExistingAgentMessage({
    feedbackMarkdown,
    insightsMarkdown,
    pendingSuggestions: pendingSuggestions.map((s) => ({
      sId: s.sId,
      kind: s.kind,
    })),
  });
}

// ─── Shrink-wrap prompt ──────────────────────────────────────────────────

export function buildShrinkWrapPrompt(
  shrinkWrappedConversation: string
): string {
  return `<dust_system>
Your task is to analyze the conversation below and suggest a configuration for a new agent
that can replicate its workflow with different inputs.

Think of it as distilling a multi-turn conversation into an efficient, single-execution agent.

Read the conversation timeline chronologically. The final messages best reflect the user's true
intent — when users refined mid-conversation ("actually do X", "also add Y", "change the format"),
the new agent must handle the FULL final scope, not intermediate states.

Identify:
- Primary use case: What problem is ultimately being solved? (look at the final output)
- Required parameters: What INPUTS varied or were provided across the conversation?
- Required capabilities: What tools, skills, or data sources were invoked?

<conversation_data>
The conversation is a chronological timeline: each message has an index, sId, sender (user or
agent name), actions (tool invocations), and content.
- If content ismarked "(truncated)", call \`inspect_message\` only if you need the full content.
- Call \`inspect_message\` when you need the exact argument shape for a tool (e.g. query,
  childAgent.uri, filters) to write generalized instructions — extract the shape, not literal values.
- Never call \`inspect_message\` speculatively on every message, on user messages unless truncated,
  or on simple text-only responses.
</conversation_data>

<sub-agent_handling>
If \`inspect_conversation\` returns a \`childConversationId\` in any action and it is relevant to the final output, call
\`inspect_conversation\` on that child before deciding whether you need \`inspect_message\`
on any of its messages. Do NOT duplicate sub-agent logic via instruction suggestions — prefer to reuse existing
agents via sub-agent configuration.
</sub-agent_handling>

<generalizing>
It is imperative you refer to <generalization_over_examples> to avoid hardcoding literal values.
When users iterated on a conversation output (e.g., changed topic, added constraint, refined format), the final agent
should gather ALL parameters that were eventually needed — not branch conditionally on them.

Example:
- Conversation: "write poem about flowers" → "actually mountains" → "include the word 'door'"
- WRONG: conditionals for each refinement
- RIGHT: "Gather the poem topic and any specific words to include. Write a poem incorporating those."
</generalizing>

<identifying_knowledge_sources>
Step 1 — Scan \`inspect_conversation\` for knowledge-access actions. Look for tool names:
- \`semantic_search\` (server: \`search\`), \`retrieve_recent_documents\` (server: \`project_manager\`) → semantic / recent retrieval
- \`cat\`, \`find\`, \`list\`, \`locate_in_tree\` → filesystem browsing (server: \`data_sources_file_system\`)
- \`query_tables\`, \`get_database_schema\` → table/SQL access
- \`run_agent\` → sub-agent (inspect child conversation separately)

Step 2 — Call \`inspect_message\` on those specific messages. In the tool call Input JSON, look for:
- \`dataSources[].uri\` — exact data source URI (most reliable)
- \`query\` — what was retrieved (use to explain WHY to recommend the source)

Step 3 — Corroborate with citations. \`:cite[ref]\` directives in agent responses confirm which
sources were actually used. Prioritize sources that appear in both tool inputs AND citations.

Step 4 — Recommend with context, never auto-add. For each source, suggest it with a one-line
reason tied to its role: e.g. "Notion: used to retrieve project briefs for the report".
</identifying_knowledge_sources>

<mapping_to_suggestions>
- Tools/Skills: Suggest based on the Actions list in the conversation.
- Knowledge: Follow <identifying_knowledge_sources>; one-line reason per source, never auto-add.
</mapping_to_suggestions>

Here is the conversation to analyze:

<conversation>
${shrinkWrappedConversation}
</conversation>

Before suggesting agent instructions, confirm your understanding:
- Goal: What problem this agent solves
- Inputs: What parameters/data users will provide
- Outputs: What the agent will produce

Unless the conversation is very short and unambiguous, wait for confirmation before generating
the full suggestion set.
</dust_system>`;
}

/**
 * Builds the shrink-wrap sidekick first-message for an existing conversation.
 * Returns Err with a `ConversationError` (or the original render error) if
 * the conversation can't be accessed or rendered.
 */
export async function buildShrinkWrapPromptForConversation(
  auth: Authenticator,
  conversationId: string
): Promise<Result<string, Error>> {
  const conversationRes = await renderConversationAsTextWithFeedback(auth, {
    conversationId,
  });

  if (conversationRes.isErr()) {
    // Distinguish "not found" vs. "access restricted" for the UI.
    const canAccess = await ConversationResource.canAccess(
      auth,
      conversationId
    );
    const error =
      canAccess === "conversation_access_restricted"
        ? new ConversationError("conversation_access_restricted")
        : conversationRes.error;
    return new Err(error);
  }

  return new Ok(buildShrinkWrapPrompt(conversationRes.value.text));
}
