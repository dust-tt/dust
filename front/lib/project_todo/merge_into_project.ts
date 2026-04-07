import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getFastestWhitelistedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { ConversationTodoVersionedResource } from "@app/lib/resources/conversation_todo_versioned_resource";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import { z } from "zod";

// sId used as `createdByAgentConfigurationId` / `markedAsDoneByAgentConfigurationId`
// for all todos managed by the merge algorithm.
const MERGER_AGENT_ID = "conversation_todo_merger";

// ── Layer 2 helpers ──────────────────────────────────────────────────────────

// Calls the LLM with a single batched request: given a list of completed
// action item texts and a list of open user-created follow_up todos (with
// their stable sIds), returns the sIds of todos that are clearly resolved.
async function callMatchCompletedItemsLLM(
  auth: Authenticator,
  {
    model,
    doneActionItemTexts,
    openUserTodos,
    spaceId,
    workspaceId,
  }: {
    model: ModelConfigurationType;
    doneActionItemTexts: string[];
    openUserTodos: Array<{ sId: string; text: string }>;
    spaceId: string;
    workspaceId: string;
  }
): Promise<string[]> {
  const specification: AgentActionSpecification = {
    name: "match_completed_items",
    description:
      "Given a list of completed action items from conversations and a list of " +
      "open user todos, identify which open todos have been resolved by those " +
      "action items. Return only high-confidence matches.",
    inputSchema: {
      type: "object",
      properties: {
        resolved_todo_sids: {
          type: "array",
          items: { type: "string" },
          description:
            "sIds of user todos that are clearly resolved by the completed " +
            "action items. Include only high-confidence matches.",
        },
      },
      required: ["resolved_todo_sids"],
    },
  };

  const doneItemsText = doneActionItemTexts
    .map((text, i) => `${i + 1}. ${text}`)
    .join("\n");

  const openTodosText = openUserTodos
    .map((t) => `- sId: ${t.sId} | ${t.text}`)
    .join("\n");

  const prompt =
    "You are a project assistant. Identify which open user todos have been " +
    "completed based on recent conversation activity.\n\n" +
    "Completed action items from conversations:\n" +
    doneItemsText +
    "\n\nOpen user todos (with their stable sIds):\n" +
    openTodosText +
    "\n\nYou MUST call the match_completed_items tool. Return the sIds of todos " +
    "that are clearly resolved. Only include high-confidence matches.";

  const conv: ModelConversationTypeMultiActions = {
    messages: [
      {
        role: "user",
        name: "todo_merger",
        content: [{ type: "text", text: prompt }],
      },
    ],
  };

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: specification.name,
      useCache: false,
    },
    {
      conversation: conv,
      prompt,
      specifications: [specification],
      forceToolCall: specification.name,
    },
    {
      context: {
        operationType: "project_todo_merge_follow_ups",
        spaceId,
        workspaceId,
      },
    }
  );

  if (res.isErr()) {
    logger.error(
      { spaceId, workspaceId, error: res.error },
      "Project todo merge: Layer 2 LLM call failed"
    );
    return [];
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    logger.warn(
      { spaceId, workspaceId },
      "Project todo merge: no tool call in Layer 2 LLM response"
    );
    return [];
  }

  const parsed = z
    .object({ resolved_todo_sids: z.array(z.string()) })
    .safeParse(action.arguments);

  if (!parsed.success) {
    logger.warn(
      { spaceId, workspaceId, error: parsed.error },
      "Project todo merge: failed to parse Layer 2 LLM response"
    );
    return [];
  }

  // Filter to only sIds that actually exist in our input set.
  const validSIds = new Set(openUserTodos.map((t) => t.sId));
  return parsed.data.resolved_todo_sids.filter((sId) => validSIds.has(sId));
}

// ── Main merge function ──────────────────────────────────────────────────────

export async function mergeConversationTodosIntoProject(
  auth: Authenticator,
  { spaceId }: { spaceId: string }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    logger.warn(
      { spaceId, workspaceId: owner.sId },
      "Project todo merge: space not found, skipping"
    );
    return;
  }
  const spaceModelId: ModelId = space.id;

  // Fetch latest conversation snapshots for the space and existing
  // agent-linked follow_up todos for the current user concurrently.
  const [snapshots, linkedTodos] = await Promise.all([
    ConversationTodoVersionedResource.fetchLatestForSpace(auth, {
      spaceModelId,
    }),
    ProjectTodoResource.fetchLinkedFollowUpsForSpace(auth, { spaceModelId }),
  ]);

  // ── Layer 1: Algorithm — agent-linked follow_up todos ─────────────────────
  //
  // For each open action item in the latest snapshots:
  //   - Not found → create a new agent-linked todo + source link.
  //   - Found, text changed → append a new version.
  //   - Found, unchanged → skip.
  //
  // For each existing linked todo whose source item is no longer open in any
  // snapshot → mark as done.

  // Lookup: "(conversationModelId):(conversationTodoItemSId)" → linked entry.
  const linkedByKey = new Map<string, (typeof linkedTodos)[number]>();
  for (const linked of linkedTodos) {
    const key = `${linked.sourceConversationModelId}:${linked.conversationTodoItemSId}`;
    linkedByKey.set(key, linked);
  }

  // Collect keys still open in the latest snapshots and texts of done items.
  const activeItemKeys = new Set<string>();
  const doneActionItemTexts: string[] = [];

  for (const snapshot of snapshots) {
    for (const item of snapshot.actionItems) {
      const key = `${snapshot.conversationId}:${item.sId}`;

      if (item.status === "open") {
        activeItemKeys.add(key);

        const linked = linkedByKey.get(key);
        if (!linked) {
          // Create a new agent-linked todo for this action item.
          const newTodo = await ProjectTodoResource.makeNew(auth, {
            spaceId: spaceModelId,
            userId: user.id,
            createdByType: "agent",
            createdByUserId: null,
            createdByAgentConfigurationId: MERGER_AGENT_ID,
            markedAsDoneByType: null,
            markedAsDoneByUserId: null,
            markedAsDoneByAgentConfigurationId: null,
            category: "follow_ups",
            text: item.text,
            version: 1,
            status: "todo",
            doneAt: null,
            actorRationale: null,
          });
          await newTodo.addSource(auth, {
            sourceType: "conversation",
            sourceConversationId: snapshot.conversationId,
            conversationTodoItemSId: item.sId,
          });
        } else if (linked.todo.text !== item.text) {
          // Text changed in the conversation — append a new version.
          await linked.todo.createVersion(auth, { text: item.text });
        }
        // Text unchanged → nothing to do.
      } else {
        // Done item — collect for Layer 2 AI matching.
        doneActionItemTexts.push(item.text);
      }
    }
  }

  // Retire linked todos whose source item is no longer open in any snapshot.
  for (const linked of linkedTodos) {
    const key = `${linked.sourceConversationModelId}:${linked.conversationTodoItemSId}`;
    if (!activeItemKeys.has(key) && linked.todo.status === "todo") {
      await linked.todo.createVersion(auth, {
        status: "done",
        doneAt: new Date(),
        markedAsDoneByType: "agent",
        markedAsDoneByUserId: null,
        markedAsDoneByAgentConfigurationId: MERGER_AGENT_ID,
        actorRationale: "Action item resolved in conversation.",
      });
    }
  }

  logger.info(
    {
      spaceId,
      workspaceId: owner.sId,
      snapshotCount: snapshots.length,
      linkedTodoCount: linkedTodos.length,
      doneItemCount: doneActionItemTexts.length,
    },
    "Project todo merge: Layer 1 complete"
  );

  // ── Layer 2: AI — auto-close user-created follow_up todos ─────────────────
  //
  // When there are done action items, ask the LLM whether any open
  // user-created (unlinked) todos in the space were resolved by them.
  // A single batched LLM call handles all matches to avoid per-item costs.

  if (doneActionItemTexts.length === 0) {
    return;
  }

  const openUserTodos =
    await ProjectTodoResource.fetchOpenUnlinkedFollowUpsForSpace(auth, {
      spaceModelId,
    });

  if (openUserTodos.length === 0) {
    return;
  }

  const model = await getFastestWhitelistedModel(auth);
  if (!model) {
    logger.warn(
      { spaceId, workspaceId: owner.sId },
      "Project todo merge: no whitelisted model for Layer 2, skipping"
    );
    return;
  }

  const resolvedSIds = await callMatchCompletedItemsLLM(auth, {
    model,
    doneActionItemTexts,
    openUserTodos: openUserTodos.map((t) => ({ sId: t.sId, text: t.text })),
    spaceId,
    workspaceId: owner.sId,
  });

  for (const sId of resolvedSIds) {
    const todo = openUserTodos.find((t) => t.sId === sId);
    if (!todo) {
      continue;
    }
    await todo.createVersion(auth, {
      status: "done",
      doneAt: new Date(),
      markedAsDoneByType: "agent",
      markedAsDoneByUserId: null,
      markedAsDoneByAgentConfigurationId: MERGER_AGENT_ID,
      actorRationale: "Completed based on conversation activity.",
    });
  }

  logger.info(
    {
      spaceId,
      workspaceId: owner.sId,
      openUserTodoCount: openUserTodos.length,
      resolvedCount: resolvedSIds.length,
    },
    "Project todo merge: Layer 2 complete"
  );
}
