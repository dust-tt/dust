import assert from "node:assert";
import inspector from "node:inspector/promises";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { Authenticator } from "@app/lib/auth";
import { saveProfile } from "@app/pages/api/debug/profiler";
import { makeScript } from "@app/scripts/helpers";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types";

makeScript(
  {
    workspaceId: {
      type: "string",
      alias: "w",
      description: "Workspace ID",
      required: true,
    },
    conversationId: {
      type: "string",
      alias: "c",
      description: "Conversation ID",
      required: true,
    },
    modelId: {
      type: "string",
      alias: "m",
      description: "Model to use for rendering",
      options: SUPPORTED_MODEL_CONFIGS.map((m) => m.modelId),
      required: true,
    },
  },
  async ({ conversationId, modelId, workspaceId }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    const session = new inspector.Session();

    session.connect();
    await session.post("HeapProfiler.enable");

    // Start allocation timeline (tracks every allocation).
    await session.post("HeapProfiler.startSampling", {
      samplingInterval: 32768, // Bytes between samples.
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });

    console.time("Fetching conversation");

    const conversationRes = await getConversation(
      auth,
      conversationId.toString()
    );
    if (conversationRes.isErr()) {
      logger.error(
        `Failed to fetch conversation: ${conversationRes.error.message}`
      );
      return;
    }

    console.timeEnd("Fetching conversation");

    const model = SUPPORTED_MODEL_CONFIGS.find((m) => m.modelId === modelId);
    assert(model, `Model not found for ${modelId}`);

    console.time("Rendering conversation");

    await renderConversationForModel(auth, {
      allowedTokenCount: model.contextSize - model.generationTokensCount,
      conversation: conversationRes.value,
      model,
      // Ignore tool and prompt contributions for this profiling.
      prompt: "",
      tools: "",
    });

    console.timeEnd("Rendering conversation");

    const { profile } = await session.post("HeapProfiler.stopSampling");
    const profilePath = await saveProfile({
      extension: "heapprofile",
      filename: "heap-timeline",
      profile,
    });

    logger.info({ profilePath }, "Heap timeline profile saved");

    session.disconnect();
  }
);
