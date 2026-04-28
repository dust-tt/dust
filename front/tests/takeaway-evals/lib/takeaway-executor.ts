import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import {
  buildActionItems,
  buildPromptActionItems,
} from "@app/lib/project_todo/analyze_document/action_items";
import { buildPromptForSourceType } from "@app/lib/project_todo/analyze_document/prompts";
import {
  type ExtractionResult,
  ExtractTakeawaysInputSchema,
} from "@app/lib/project_todo/analyze_document/types";
import { buildSpec } from "@app/lib/project_todo/analyze_document/utils";
import type { TakeawaySourceDocument } from "@app/lib/resources/takeaways_resource";
import logger from "@app/logger/logger";
import { MODEL_ID } from "@app/tests/takeaway-evals/lib/config";
import type {
  MockProjectMember,
  TakeawayExecutionResult,
  TakeawayTestCase,
} from "@app/tests/takeaway-evals/lib/types";
import SUPPORTED_MODEL_CONFIGS from "@app/types/assistant/models/models";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

/**
 * Build the project members prompt section from mock members, matching the
 * format of `buildPromptProjectMembers` in the production code.
 */
function buildMockMembersPrompt(members: MockProjectMember[]): string {
  return `Project members:\n\n${members.map((m) => `- ${m.fullName} (email: ${m.email}, id: ${m.sId})`).join("\n")}`;
}

/**
 * Build a mock TakeawaySourceDocument from the test case's document.
 * Only the fields accessed by `callExtractActionItemsLLM` are needed.
 */
function buildMockDocument(testCase: TakeawayTestCase): TakeawaySourceDocument {
  return {
    id: testCase.document.id,
    title: testCase.document.title,
    type: testCase.document.type,
    text: testCase.document.text,
    uri: testCase.document.uri,
  };
}

/**
 * Calls the real LLM with the same prompt assembly as
 * `extractDocumentTakeaways`, but without DB dependencies.
 */
async function callLLMForExtraction(
  auth: Authenticator,
  {
    model,
    specification,
    prompt,
    document,
  }: {
    model: ModelConfigurationType;
    specification: AgentActionSpecification;
    prompt: string;
    document: TakeawaySourceDocument;
  }
): Promise<ExtractionResult | null> {
  const res = await runMultiActionsAgent(
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
        workspaceId: "eval-test",
      },
    }
  );

  if (res.isErr()) {
    throw new Error(`Takeaway extraction LLM call failed: ${res.error}`);
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    return null;
  }

  const parsed = ExtractTakeawaysInputSchema.safeParse(action.arguments);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

/**
 * Execute a single takeaway extraction eval scenario by calling the real
 * LLM pipeline with mock data, then post-processing with the real build*
 * functions.
 */
export async function executeTakeawayExtraction(
  auth: Authenticator,
  testCase: TakeawayTestCase
): Promise<TakeawayExecutionResult> {
  const model = SUPPORTED_MODEL_CONFIGS.find((m) => m.modelId === MODEL_ID);
  if (!model) {
    throw new Error(`Model "${MODEL_ID}" not found in SUPPORTED_MODEL_CONFIGS`);
  }

  const previousActionItems = testCase.previousVersion?.actionItems ?? [];

  // Assemble prompt exactly as extractDocumentTakeaways does, but with mock
  // members instead of a DB call.
  const prompt = [
    buildMockMembersPrompt(testCase.members),
    buildPromptForSourceType(testCase.document.type),
    buildPromptActionItems(previousActionItems),
    "You MUST call the tool. Always call it, even if there are no action items, notable facts, or key decisions (use empty arrays).",
  ].join("\n\n");

  const specification = buildSpec();
  const document = buildMockDocument(testCase);

  const extraction = await callLLMForExtraction(auth, {
    model,
    specification,
    prompt,
    document,
  });

  if (!extraction) {
    return {
      extraction: null,
      actionItems: [],
    };
  }

  // Post-process with the real build* functions, using member sIds as the
  // set of valid user IDs.
  const validUserIds = new Set(testCase.members.map((m) => m.sId));
  const actionItems = buildActionItems(
    {
      newItems: extraction.new_action_items,
      updatedItems: extraction.updated_action_items,
    },
    previousActionItems,
    validUserIds,
    logger
  );

  return { extraction, actionItems };
}
