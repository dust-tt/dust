import { createConversation } from "@app/lib/api/assistant/conversation";
import { postUserMessageAndWaitForCompletion } from "@app/lib/api/assistant/streaming/blocking";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  AgentMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";

const PROMPT_FOR_PROJECT_SUMMARY = `Your goal is to generate an actionable intelligence digest for a user catching up on a project since their last visit.

Use the function that allows you to get what's unread for the current user.

## Instructions

Analyze unread conversations deeply — don't just list them. Extract insights across these possible sections:

- **⚠️ Needs Attention** — Blockers, unanswered questions directed at the user, stalled discussions, errors. Use "You" to address the user directly.
- **🔑 Key Decisions** — Explicit decisions made or pending. Include who decided and what the outcome was.
- **📈 Progress Highlights** — Group related work by theme. Include current status (done, in progress, blocked).
- **📁 File & Document Activity** — Significant new documents, shared files, or referenced PRs/commits.
- **👥 Team Pulse** — Who's been most active, notable contributions, anyone mentioned as OOO or unavailable.
- **📊 Activity Snapshot** — Quick metrics: number of conversations, messages, active contributors in the period.

**Pick only the 3 most relevant sections** based on what's actually happening. Skip sections with nothing meaningful to report. Always lead with "Needs Attention" if there are items requiring the user's action.

Within each section, include 1-3 bullet points max. Each bullet should link to the relevant conversation. Keep descriptions concise (one sentence).

If there is truly nothing to catch up on, say so briefly.

**Examples of valid output:**

<example1>
### ⚠️ Needs Attention
- **[Design decision waiting for you](https://dust.tt/w/conversation//sIZInTI4lD)** — You need to decide between modal vs. drawer for the settings panel. Rémy is blocked on this.
- **[CI pipeline broken](https://dust.tt/w/0ec9852c2f/conversation/gky6sxBJNQ)** — Tests have been failing for 2 days. Thomas flagged it but no one has picked it up yet.

### 📈 Progress Highlights
- **[Performance optimization](https://dust.tt/w/0ec9852c2f/conversation/gky6sxBJNQ)** — Two PRs merged targeting ~50% reduction in load time (down from 8s). Monitoring results.
- **[Onboarding flow redesign](https://dust.tt/w/0ec9852c2f/conversation/FvSszrDStM)** — Wireframes complete, moving to implementation this week.

### 👥 Team Pulse
- Rémy and Thomas drove most of the activity (12 messages each). Sarah mentioned she's OOO until Thursday.
</example1>

<example2>
Nothing to catch up! Enjoy and Relax!
</example2>

<example3>
### 🔑 Key Decisions
- **[API versioning strategy](https://dust.tt/w/0ec9852c2f/conversation/sIZInTI4lD)** — Team agreed on URL-based versioning (v1, v2) over header-based. Migration plan drafted.

### 📈 Progress Highlights
- **[Search rewrite](https://dust.tt/w/0ec9852c2f/conversation/gky6sxBJNQ)** — Elasticsearch integration complete and deployed to staging. Production rollout planned for Monday.
- **[Bug: duplicate notifications](https://dust.tt/w/0ec9852c2f/conversation/FvSszrDStM)** — Root cause identified (race condition in webhook handler). Fix in review.

### 📊 Activity Snapshot
- 8 conversations updated, 47 messages from 5 contributors over the last 3 days.
</example3>`;

export const generateUserProjectDigest = async (
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<{
  conversation: ConversationType;
  agentMessages: AgentMessageType[];
}> => {
  const conversation = await createConversation(auth, {
    title: `[System] User Digest Generation - ${space.name}`,
    visibility: "test",
    spaceId: space.id,
    metadata: {
      systemConversation: true,
      purpose: "user_project_digest",
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
    "Created system conversation for user project digest generation"
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
    throw new Error(
      `Failed to generate user project digest via agent: ${errorMessage}`
    );
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
