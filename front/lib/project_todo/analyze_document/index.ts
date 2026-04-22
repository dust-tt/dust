import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getSmallWhitelistedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import {
  buildActionItems,
  buildPromptActionItems,
} from "@app/lib/project_todo/analyze_document/action_items";
import {
  buildKeyDecisions,
  buildPromptKeyDecisions,
} from "@app/lib/project_todo/analyze_document/key_decisions";
import {
  buildNotableFacts,
  buildPromptNotableFacts,
} from "@app/lib/project_todo/analyze_document/notable_facts";
import {
  type ExtractionResult,
  ExtractTakeawaysInputSchema,
} from "@app/lib/project_todo/analyze_document/types";
import { buildSpec } from "@app/lib/project_todo/analyze_document/utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  type TakeawaySourceDocument,
  TakeawaysResource,
} from "@app/lib/resources/takeaways_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { removeNulls } from "@app/types/shared/utils/general";
import { startActiveObservation } from "@langfuse/tracing";
import type { Logger } from "pino";
import { buildPromptForSourceType } from "./prompts";

async function buildPromptProjectMembers(
  auth: Authenticator,
  { spaceId }: { spaceId: string }
): Promise<string> {
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    throw new Error("Space not found for project members prompt");
  }

  const r = await space.fetchManualGroupsMemberships(auth, {
    shouldIncludeAllMembers: true,
  });

  const members = await UserResource.fetchByModelIds(
    r.allGroupMemberships.map((m) => m.userId)
  );
  return `Project members:\n\n${members.map((m) => `- ${m.fullName()} (email: ${m.email}, id: ${m.sId})`).join("\n")}`;
}

// Calls the LLM with a forced extract_action_items tool call and parses the result.
// Returns null if the call fails, produces no tool call, or the output fails parsing.
async function callExtractActionItemsLLM(
  auth: Authenticator,
  {
    localLogger,
    model,
    specification,
    prompt,
    document,
  }: {
    localLogger: Logger;
    model: ModelConfigurationType;
    specification: AgentActionSpecification;
    prompt: string;
    document: TakeawaySourceDocument;
  }
): Promise<ExtractionResult | null> {
  const owner = auth.getNonNullableWorkspace();
  const res = await startActiveObservation(
    "project-todo-analyze-document",
    () =>
      runMultiActionsAgent(
        auth,
        {
          providerId: model.providerId,
          modelId: model.modelId,
          functionCall: specification.name,
          useCache: false,
        },
        {
          conversation: {
            messages: [
              {
                role: "user",
                name: "takeaway_extractor",
                content: [{ type: "text", text: document.text }],
              },
            ],
          },
          prompt,
          specifications: [specification],
          forceToolCall: specification.name,
        },
        {
          context: {
            operationType: "project_todo_analyze_document",
            sourceId: document.id,
            sourceType: document.type,
            workspaceId: owner.sId,
          },
        }
      )
  );
  if (res.isErr()) {
    localLogger.error(
      { error: res.error },
      "Document takeaway: LLM call failed"
    );
    return null;
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    localLogger.warn("Document takeaway: no tool call in LLM response");
    return null;
  }

  const parsed = ExtractTakeawaysInputSchema.safeParse(action.arguments);
  if (!parsed.success) {
    localLogger.warn(
      { error: parsed.error, arguments: action.arguments },
      "Document takeaway: failed to parse LLM response"
    );
    return null;
  }
  return parsed.data;
}

// Maps raw LLM-extracted items to typed action items, reusing sIds from the
// previous version when the LLM echoes them back, generating new UUIDs otherwise.

export type ExtractedTakeawayStats = {
  actionItems: number;
  keyDecisions: number;
  notableFacts: number;
};

// Returns counts of extracted takeaways, or null if extraction failed.
export async function extractDocumentTakeaways(
  auth: Authenticator,
  {
    localLogger: parentLogger,
    spaceId,
    document,
  }: {
    localLogger: Logger;
    spaceId: string;
    document: TakeawaySourceDocument;
  }
): Promise<ExtractedTakeawayStats | null> {
  const localLogger = parentLogger.child({
    sourceId: document.id,
    sourceType: document.type,
  });

  // Fetch the model and the previous version concurrently — they are independent.
  const [model, previousVersion] = await Promise.all([
    getSmallWhitelistedModel(auth),
    TakeawaysResource.fetchLatestBySourceIdAndType(auth, {
      sourceId: document.id,
      sourceType: document.type,
    }),
  ]);
  if (!model) {
    localLogger.warn("Document takeaway: no whitelisted model available");
    return null;
  }

  const previousActionItems = previousVersion?.actionItems ?? [];
  const previousNotableFacts = previousVersion?.notableFacts ?? [];
  const previousKeyDecisions = previousVersion?.keyDecisions ?? [];

  const prompt = [
    await buildPromptProjectMembers(auth, { spaceId }),
    buildPromptForSourceType(document.type),
    buildPromptActionItems(previousActionItems),
    buildPromptNotableFacts(previousNotableFacts),
    buildPromptKeyDecisions(previousKeyDecisions),
    "You MUST call the tool. Always call it, even if there are no action items, notable facts, or key decisions (use empty arrays).",
  ].join("\n\n");
  const specification = buildSpec();

  const extraction = await callExtractActionItemsLLM(auth, {
    localLogger,
    model,
    specification,
    prompt,
    document,
  });
  if (!extraction) {
    localLogger.error("Document takeaway: no extraction result");
    return null;
  }

  // Fetch all assignees from the action items.
  const assignees = await UserResource.fetchByIds(
    removeNulls([
      ...new Set([
        ...extraction.action_items.map((item) => item.assignee_user_id),
        ...extraction.notable_facts
          .map((fact) => fact.relevant_user_ids)
          .flat(),
        ...extraction.key_decisions.map((d) => d.relevant_user_ids).flat(),
      ]),
    ])
  );

  const validAssigneesUserIds = new Set(assignees.map((u) => u.sId));

  const actionItems = buildActionItems(
    extraction.action_items,
    previousActionItems,
    validAssigneesUserIds
  );
  const notableFacts = buildNotableFacts(
    extraction.notable_facts,
    previousNotableFacts,
    validAssigneesUserIds
  );
  const keyDecisions = buildKeyDecisions(
    extraction.key_decisions,
    previousKeyDecisions,
    validAssigneesUserIds
  );

  const stats: ExtractedTakeawayStats = {
    actionItems: actionItems.length,
    keyDecisions: keyDecisions.length,
    notableFacts: notableFacts.length,
  };

  if (
    actionItems.length === 0 &&
    notableFacts.length === 0 &&
    keyDecisions.length === 0
  ) {
    localLogger.info("Document takeaway: no takeaways extracted");
    return stats;
  }

  await TakeawaysResource.makeNewForDocument(auth, {
    document,
    spaceId,
    actionItems,
    notableFacts,
    keyDecisions,
  });

  localLogger.info(
    {
      actionItemCount: actionItems.length,
      notableFactCount: notableFacts.length,
      keyDecisionCount: keyDecisions.length,
    },
    "Document takeaway: analysis complete"
  );

  return stats;
}
