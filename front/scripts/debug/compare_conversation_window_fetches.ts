/**
 * Compares the read-only data-loading paths used by full and checkpointed agent-loop contexts.
 *
 * Run on a production pod:
 *
 *   npx tsx scripts/debug/compare_conversation_window_fetches.ts \
 *     --workspaceId <workspace_id> \
 *     --conversationId <conversation_id> \
 *     --agentMessageId <agent_message_id> \
 *     --userMessageId <user_message_id> \
 *     --iterations 5 \
 *     --execute
 */

import { performance } from "node:perf_hooks";

import { getConversationForCheckpoint } from "@app/lib/api/assistant/conversation_rendering/checkpoint_conversation";
import { loadConversationWindowCheckpoint } from "@app/lib/api/assistant/conversation_rendering/conversation_window_checkpoint";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { makeScript } from "@app/scripts/helpers";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import {
  buildAgentLoopDataFromConversation,
  getFullAgentLoopDataWithAuth,
} from "@app/types/assistant/agent_run";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";

type TimingSummary = {
  minMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  meanMs: number;
  samplesMs: number[];
};

type StepBenchmark =
  | {
      status: "available";
      checkpointStep: number;
      targetStep: number;
      checkpointLoad: TimingSummary;
      boundedHydration: TimingSummary;
      checkpointReadPath: TimingSummary;
    }
  | {
      status: "missing_or_expired";
      checkpointStep: number;
      targetStep: number;
    }
  | {
      status: "load_error";
      checkpointStep: number;
      targetStep: number;
      error: string;
    };

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function summarize(samplesMs: number[]): TimingSummary {
  const sortedMs = [...samplesMs].sort((left, right) => left - right);
  const medianIndex = Math.floor(sortedMs.length / 2);
  const p95Index = Math.ceil(sortedMs.length * 0.95) - 1;

  return {
    minMs: roundMs(sortedMs[0]),
    medianMs: roundMs(sortedMs[medianIndex]),
    p95Ms: roundMs(sortedMs[p95Index]),
    maxMs: roundMs(sortedMs[sortedMs.length - 1]),
    meanMs: roundMs(
      samplesMs.reduce((sum, sampleMs) => sum + sampleMs, 0) / samplesMs.length
    ),
    samplesMs: samplesMs.map(roundMs),
  };
}

async function buildAgentLoopArgs(
  auth: Authenticator,
  {
    agentMessageId,
    conversationId,
    userMessageId,
  }: {
    agentMessageId: string;
    conversationId: string;
    userMessageId: string;
  }
): Promise<AgentLoopArgs> {
  const conversationResult = await getConversationForCheckpoint(
    auth,
    conversationId,
    {
      agentMessageId,
      targetStep: 0,
      userMessageId,
    }
  );
  if (conversationResult.isErr()) {
    throw conversationResult.error;
  }

  const renderedMessages = conversationResult.value.content.flat();
  const agentMessage = renderedMessages.find(isAgentMessageType);
  const userMessage = renderedMessages.find(isUserMessageType);
  if (!agentMessage || !userMessage) {
    throw new Error("Unable to render the agent-loop messages");
  }

  return {
    agentMessageId,
    agentMessageVersion: agentMessage.version,
    conversationId,
    conversationTitle: conversationResult.value.title,
    userMessageId: userMessage.sId,
    userMessageVersion: userMessage.version,
    userMessageOrigin: userMessage.context.origin,
  };
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Workspace sId",
      required: true,
    },
    conversationId: {
      type: "string",
      description: "Conversation sId",
      required: true,
    },
    agentMessageId: {
      type: "string",
      description: "Agent message sId",
      required: true,
    },
    userMessageId: {
      type: "string",
      description: "User message sId from the agent-loop arguments",
      required: true,
    },
    iterations: {
      type: "number",
      description: "Measured iterations after one warmup",
      default: 5,
    },
  },
  async (
    {
      agentMessageId,
      conversationId,
      execute,
      iterations,
      userMessageId,
      workspaceId,
    },
    logger
  ) => {
    if (!execute) {
      return;
    }
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 20) {
      throw new Error("iterations must be an integer between 1 and 20");
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const agentLoopArgs = await buildAgentLoopArgs(auth, {
      agentMessageId,
      conversationId,
      userMessageId,
    });

    const fetchFull = async () => {
      const result = await getFullAgentLoopDataWithAuth(auth, agentLoopArgs);
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    };
    const fetchBounded = async (targetStep: number) => {
      const conversationResult = await getConversationForCheckpoint(
        auth,
        conversationId,
        {
          agentMessageId,
          targetStep,
          userMessageId: agentLoopArgs.userMessageId,
        }
      );
      if (conversationResult.isErr()) {
        throw conversationResult.error;
      }

      const result = await buildAgentLoopDataFromConversation(
        auth,
        agentLoopArgs,
        conversationResult.value
      );
      if (result.isErr()) {
        throw result.error;
      }
    };
    const loadCheckpoint = async (checkpointStep: number) => {
      return loadConversationWindowCheckpoint({
        workspaceId,
        conversationId,
        agentMessageId,
        agentMessageVersion: agentLoopArgs.agentMessageVersion,
        step: checkpointStep,
      });
    };

    const fullData = await fetchFull();
    const recordedSteps = [
      ...fullData.agentMessage.actions.map((action) => action.step),
      ...fullData.agentMessage.contents.map((content) => content.step),
    ];
    const maxRecordedStep = Math.max(0, ...recordedSteps);
    const checkpointSteps = Array.from(
      { length: maxRecordedStep + 1 },
      (_, step) => step
    );

    const fullHydrationSamplesMs: number[] = [];
    for (let index = 0; index < iterations; index++) {
      const startedAtMs = performance.now();
      await fetchFull();
      fullHydrationSamplesMs.push(performance.now() - startedAtMs);
    }

    const steps: StepBenchmark[] = [];
    for (const checkpointStep of checkpointSteps) {
      const targetStep = checkpointStep + 1;
      const checkpointResult = await loadCheckpoint(checkpointStep);
      if (checkpointResult.isErr()) {
        steps.push({
          status: "load_error",
          checkpointStep,
          targetStep,
          error: checkpointResult.error.message,
        });
        continue;
      }
      if (!checkpointResult.value) {
        steps.push({
          status: "missing_or_expired",
          checkpointStep,
          targetStep,
        });
        continue;
      }

      await fetchBounded(targetStep);
      const checkpointLoadSamplesMs: number[] = [];
      const boundedHydrationSamplesMs: number[] = [];
      const checkpointReadPathSamplesMs: number[] = [];

      for (let index = 0; index < iterations; index++) {
        const startedAtMs = performance.now();
        const measuredCheckpointResult = await loadCheckpoint(checkpointStep);
        if (measuredCheckpointResult.isErr()) {
          throw measuredCheckpointResult.error;
        }
        if (!measuredCheckpointResult.value) {
          throw new Error("Checkpoint expired while running the benchmark");
        }
        const checkpointLoadedAtMs = performance.now();
        await fetchBounded(targetStep);
        const completedAtMs = performance.now();

        checkpointLoadSamplesMs.push(checkpointLoadedAtMs - startedAtMs);
        boundedHydrationSamplesMs.push(completedAtMs - checkpointLoadedAtMs);
        checkpointReadPathSamplesMs.push(completedAtMs - startedAtMs);
      }

      steps.push({
        status: "available",
        checkpointStep,
        targetStep,
        checkpointLoad: summarize(checkpointLoadSamplesMs),
        boundedHydration: summarize(boundedHydrationSamplesMs),
        checkpointReadPath: summarize(checkpointReadPathSamplesMs),
      });
    }

    logger.info(
      {
        workspaceId,
        conversationId,
        agentMessageId,
        agentMessageVersion: agentLoopArgs.agentMessageVersion,
        userMessageId: agentLoopArgs.userMessageId,
        iterations,
        checkpointBucket: getPrivateUploadBucket().name,
        codeVersion: process.env.DD_VERSION,
        fullHydration: summarize(fullHydrationSamplesMs),
        steps,
      },
      "Conversation window fetch benchmark"
    );
  }
);
