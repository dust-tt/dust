import { formatConversationsForDisplay } from "@app/lib/api/actions/servers/project_manager/tools/conversation_formatting";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { getLargeWhitelistedModel } from "@app/types/assistant/assistant";

const DAYS_BACK = 30;
const UNREAD_LIMIT = 20;

const PROMPT_FOR_PROJECT_SUMMARY = `Your goal is to generate an actionable intelligence digest for a user catching up on a project since their last visit.

The unread conversations for the current user are provided below.

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

export async function generateUserProjectDigest(
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<string> {
  const owner = auth.getNonNullableWorkspace();

  // Fetch unread conversations (same logic as list_unread tool).
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DAYS_BACK);

  const spaceConversations =
    await ConversationResource.listConversationsInSpace(auth, {
      spaceId: space.sId,
      options: {
        updatedSince: cutoffDate.getTime(),
      },
    });

  const conversationResults = await concurrentExecutor(
    spaceConversations,
    async (c) => getConversation(auth, c.sId, false),
    { concurrency: 10 }
  );

  const conversationsFull = conversationResults
    .filter((r) => r.isOk())
    .map((r) => r.value);

  const unreadConversations = conversationsFull.filter((c) => c.unread);
  const limitedConversations = unreadConversations.slice(0, UNREAD_LIMIT);

  // Format conversations for display.
  const formattedConversations =
    limitedConversations.length > 0
      ? JSON.stringify(
          formatConversationsForDisplay(limitedConversations, owner.sId)
        )
      : `No unread conversations found in project "${space.name}" from the last ${DAYS_BACK} days.`;

  // Build caller identity for the prompt so the LLM knows who "you" is.
  const user = auth.getNonNullableUser();
  const callerInfo = [
    `Name: ${user.fullName}`,
    `Username: @${user.fullName()}`,
    `Email: ${user.email}`,
  ].join("\n");

  // Call the LLM directly.
  const model = getLargeWhitelistedModel(owner);
  if (!model) {
    throw new Error("No whitelisted model available for project digest.");
  }

  const res = await runMultiActionsAgent(
    auth,
    {
      modelId: model.modelId,
      providerId: model.providerId,
      temperature: 0.4,
    },
    {
      conversation: {
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: `## Current User (the person reading this digest)\n${callerInfo}\n\n## Unread Conversations\n${formattedConversations}`,
              },
            ],
            name: "",
          },
        ],
      },
      prompt: PROMPT_FOR_PROJECT_SUMMARY,
      specifications: [],
    },
    {
      context: {
        operationType: "user_project_digest",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    logger.error(
      {
        spaceId: space.sId,
        error: res.error.message,
      },
      "Failed to generate user project digest via LLM"
    );
    throw new Error(
      `Failed to generate user project digest: ${res.error.message}`
    );
  }

  const digest = res.value.generation?.trim() ?? "";
  if (!digest) {
    logger.error(
      { spaceId: space.sId },
      "LLM returned empty generation for project digest"
    );
    throw new Error("LLM did not return any content for project digest.");
  }

  logger.info(
    {
      spaceId: space.sId,
      spaceName: space.name,
      unreadCount: limitedConversations.length,
      digestLength: digest.length,
    },
    "Generated user project digest via direct LLM call"
  );

  return digest;
}
