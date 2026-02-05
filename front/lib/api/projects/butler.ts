import { createConversation } from "@app/lib/api/assistant/conversation";
import { postUserMessageAndWaitForCompletion } from "@app/lib/api/assistant/streaming/blocking";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { AgentMessageType, ConversationType } from "@app/types";
import { GLOBAL_AGENTS_SID } from "@app/types";

const PROMPT_FOR_PROJECT_SUMMARY = `Your goal is to generate a very short and actionable digest of what a user should look at in a project since their last visit.

Use the function that allows you to get what's unread for the current user.
Generate a maximum five items with a short description and a link to the relevant conversation.
Show only the items, no need for a general title or description.
Prioritize anything that requires the user's immediate attention and use "You" to address the user in that case.

**Examples of valid output:**

<example1>
- 📊 **[Weekly Project Activity Journal](https://dust.tt/w/0ec9852c2f/assistant/sIZInTI4lD)** - A comprehensive weekly digest covering the last 7 days of project activity, including key conversations, decisions, blockers and next steps.
- ⚡ **[Critical Performance Fix](https://dust.tt/w/0ec9852c2f/assistant/gky6sxBJNQ)** - Major progress on addressing the loading speed crisis (projects taking 8s to load). Two PRs are in progress targeting a ~50% reduction in payload size.
- 🐛 **[IssueBot Meta-Bug](https://dust.tt/w/0ec9852c2f/assistant/gky6sxBJNQ)** - Rémy reported a bug about IssueBot not working as expected (Task #6343 created for the team to address).
- 📚 **[Research: LLMs for Prompt Improvement](https://dust.tt/w/0ec9852c2f/assistant/FvSszrDStM)** - Deep dive into scientific community perspectives on whether LLMs are effective at crafting and improving prompts (spoiler: hybrid human-AI approaches work best).
- 🔧 **[Sparkle Collapsible Components](https://dust.tt/w/0ec9852c2f/assistant/FvSszrDStM)** - Technical guidance on collapsible/truncated message components available in Sparkle (no auto-collapse by size, but manual and text truncation options exist).
</example1>

<example2>
Nothing to catch up! Enjoy and Relax!
</example2>

<example3>
- ⚠️ **[Design decision waiting for you](https://dust.tt/w/0ec9852c2f/assistant/sIZInTI4lD)** - Rémy is blocked on the implementation of Feature X, he needs you to decide between a button or a checkbox.
- ⚡ **[Critical Performance Fix](https://dust.tt/w/0ec9852c2f/assistant/gky6sxBJNQ)** - Major progress on addressing the loading speed crisis (projects taking 8s to load). Two PRs are in progress targeting a ~50% reduction in payload size.
- 🐛 **[IssueBot Meta-Bug](https://dust.tt/w/0ec9852c2f/assistant/gky6sxBJNQ)** - Rémy reported a bug about IssueBot not working as expected (Task #6343 created for the team to address).
</example3>`;

export const generateProjectSummary = async (
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<{
  conversation: ConversationType;
  agentMessages: AgentMessageType[];
}> => {
  const conversation = await createConversation(auth, {
    title: `[System] Journal Generation - ${space.name}`,
    visibility: "test",
    spaceId: space.id,
    metadata: {
      systemConversation: true,
      purpose: "journal_generation",
      triggeredBy: auth.user()?.sId ?? "system",
      spaceId: space.sId,
    },
  });

  logger.info(
    {
      conversationId: conversation.sId,
      spaceId: space.sId,
      spaceName: space.name,
    },
    "Created system conversation for journal generation"
  );

  const messageResult = await postUserMessageAndWaitForCompletion(auth, {
    content: PROMPT_FOR_PROJECT_SUMMARY,
    context: {
      username: "system",
      fullName: "System",
      email: null,
      profilePictureUrl: null,
      timezone: "UTC",
      origin: "project_butler",
    },
    conversation,
    mentions: [
      {
        configurationId: GLOBAL_AGENTS_SID.DUST,
      },
    ],
    skipToolsValidation: false,
  });

  if (messageResult.isErr()) {
    const errorMessage =
      messageResult.error.api_error?.message ||
      JSON.stringify(messageResult.error);
    logger.error(
      {
        spaceId: space.sId,
        conversationId: conversation.sId,
        error: messageResult.error,
      },
      "Failed to post message or wait for agent completion"
    );
    throw new Error(`Failed to generate journal via agent: ${errorMessage}`);
  }

  const { agentMessages } = messageResult.value;

  if (agentMessages.length === 0) {
    logger.error(
      {
        spaceId: space.sId,
        conversationId: conversation.sId,
      },
      "No agent messages received"
    );
    throw new Error("Agent did not respond with a message");
  }

  return { conversation, agentMessages };
};
