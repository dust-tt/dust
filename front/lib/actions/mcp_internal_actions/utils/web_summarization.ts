import { DustAPI } from "@dust-tt/client";

import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, getHeaderFromUserEmail, Ok } from "@app/types";

const MAX_CHARACTERS_TO_SUMMARIZE = 100_000;

export async function summarizeWithAgent({
  auth,
  agentLoopRunContext,
  summaryAgentId,
  content,
}: {
  auth: Authenticator;
  agentLoopRunContext: AgentLoopRunContextType;
  summaryAgentId: string;
  content: string;
}): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();
  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const api = new DustAPI(
    config.getDustAPIConfig(),
    {
      ...prodCredentials,
      extraHeaders: { ...getHeaderFromUserEmail(user?.email) },
    },
    logger
  );

  const mainAgent = agentLoopRunContext.agentConfiguration;
  const mainConversation = agentLoopRunContext.conversation;
  const toSummarize = content.slice(0, MAX_CHARACTERS_TO_SUMMARIZE);

  const convRes = await api.createConversation({
    title: `Summary of web page content (main conversation: ${mainConversation.sId})`,
    visibility: "unlisted",
    depth: mainConversation.depth + 1,
    message: {
      content: `Summarize the following web page content.\n\n` + toSummarize,
      mentions: [{ configurationId: summaryAgentId }],
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        username: mainAgent.name,
        fullName: `@${mainAgent.name}`,
        email: null,
        profilePictureUrl: mainAgent.pictureUrl,
        origin: "run_agent",
        selectedMCPServerViewIds: null,
      },
    },
    params: { execution: "async" },
  });

  if (convRes.isErr() || !convRes.value.message) {
    return new Err(new Error("Failed to create summary conversation"));
  }

  const { conversation, message } = convRes.value;
  const streamRes = await api.streamAgentAnswerEvents({
    conversation,
    userMessageId: message.sId,
    options: {
      maxReconnectAttempts: 5,
      reconnectDelay: 5000,
      autoReconnect: true,
    },
  });
  if (streamRes.isErr()) {
    return new Err(
      new Error(`Failed to stream summary: ${streamRes.error.message}`)
    );
  }

  let finalContent = "";

  for await (const event of streamRes.value.eventStream) {
    if (
      event.type === "generation_tokens" &&
      event.classification === "tokens"
    ) {
      finalContent += event.text;
    } else if (event.type === "agent_message_success") {
      break;
    }
  }

  finalContent = finalContent.trim();
  if (!finalContent) {
    return new Err(new Error("Summary agent returned empty content"));
  }
  return new Ok(finalContent);
}
