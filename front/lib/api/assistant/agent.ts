import assert from "assert";

import {
  TOOL_NAME_SEPARATOR,
  tryListMCPTools,
} from "@app/lib/actions/mcp_actions";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getRunnerForActionConfiguration } from "@app/lib/actions/runners";
import {
  isDustAppChatBlockType,
  runActionStreamed,
} from "@app/lib/actions/server";
import type {
  ActionConfigurationType,
  AgentActionSpecification,
} from "@app/lib/actions/types/agent";
import { isActionConfigurationType } from "@app/lib/actions/types/agent";
import { isMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { getCitationsCount } from "@app/lib/actions/utils";
import { createClientSideMCPServerConfigurations } from "@app/lib/api/actions/mcp_client_side";
import { categorizeAgentErrorMessage } from "@app/lib/api/assistant/agent_errors";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { ensureConversationTitle } from "@app/lib/api/assistant/conversation/title";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { isLegacyAgentConfiguration } from "@app/lib/api/assistant/legacy_agent";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import config from "@app/lib/api/config";
import { getRedisClient } from "@app/lib/api/redis";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { wakeLock } from "@app/lib/wake_lock";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";
import type {
  AgentActionsEvent,
  ConversationType,
  ModelId,
  RunAgentArgs,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  getRunAgentData,
  MAX_STEPS_USE_PER_RUN_LIMIT,
  removeNulls,
} from "@app/types";
import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";
import { runModelActivity } from "@app/temporal/agent_loop/activities/run_model";
import { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";

const MAX_ACTIONS_PER_STEP = 16;

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// but it now handles updating it based on the execution results.
export async function runAgentWithStreaming(
  authType: AuthenticatorType,
  runAgentArgs: RunAgentArgs
): Promise<void> {
  const titlePromise = ensureConversationTitle(authType, runAgentArgs);

  // Citations references offset kept up to date across steps.
  let citationsRefsOffset = 0;

  const runIds: string[] = [];

  // Track step content IDs by function call ID for later use in actions.
  let functionCallStepContentIds: Record<string, ModelId> = {};

  await wakeLock(async () => {
    for (let i = 0; i < MAX_STEPS_USE_PER_RUN_LIMIT + 1; i++) {
      const result = await runModelActivity({
        authType,
        runAgentArgs,
        runIds,
        step: i,
        functionCallStepContentIds,
        autoRetryCount: 0,
      });

      if (!result) {
        // Generation completed or error occurred
        return;
      }

      // Update state with results from runMultiActionsAgent
      runIds.push(result.runId);
      functionCallStepContentIds = result.functionCallStepContentIds;

      // We received the actions to run, but will enforce a limit on the number of actions (16)
      // which is very high. Over that the latency will just be too high. This is a guardrail
      // against the model outputting something unreasonable.
      const actionsToRun = result.actions.slice(0, MAX_ACTIONS_PER_STEP);

      const citationsIncrements = await Promise.all(
        actionsToRun.map(({ inputs, functionCallId }, index) => {
          // Find the step content ID for this function call
          const stepContentId = functionCallId
            ? functionCallStepContentIds[functionCallId]
            : undefined;

          return runToolActivity(authType, {
            runAgentArgs,
            inputs,
            functionCallId,
            step: i,
            stepActionIndex: index,
            stepActions: actionsToRun.map((a) => a.action),
            citationsRefsOffset,
            stepContentId,
          });
        })
      );

      citationsRefsOffset += citationsIncrements.reduce(
        (acc, curr) => acc + curr.citationsIncrement,
        0
      );
    }
  });

  await titlePromise;

  assert(authType.workspaceId, "Workspace ID is required");

  // It's fine to start the workflow here because the workflow will sleep for one hour before
  // computing usage.
  await launchUpdateUsageWorkflow({
    workspaceId: authType.workspaceId,
  });
}
