import {
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentMessagePublicType,
  AgentMessageSuccessEvent,
  ConversationPublicType,
  DustAPI,
  GenerationTokensEvent,
  UserMessageErrorEvent,
} from "@dust-tt/client";
import { createParser } from "eventsource-parser";

const BASE_URL = "https://dust.tt";

async function posMessage({
  apiKey,
  workspaceId,
  agentId,
  messageTxt,
}: {
  apiKey: string;
  workspaceId: string;
  agentId: string;
  messageTxt: string;
}) {
  const dustClient = new DustAPI(
    {
      url: BASE_URL,
    },
    {
      apiKey,
      workspaceId,
    },
    console
  );
  const convRes = await dustClient.createConversation({
    title: `Experiment ${new Date().toISOString()}`,
    visibility: "unlisted",
    message: {
      content: messageTxt,
      mentions: [{ configurationId: agentId }],
      context: {
        username: "test",
        fullName: "Test Test",
        timezone: "America/New_York",
        email: "henry@dust.tt",
        origin: "api",
      },
    },
    contentFragment: undefined,
  });

  if (convRes.isErr()) {
    throw new Error(`Failed to create conversation: ${convRes.error.message}`);
  }

  const conversation = convRes.value.conversation;
  const message = convRes.value.message;
  if (!message) {
    throw new Error("No message created");
  }
  const agentMessages = conversation.content
    .map((versions) => {
      const m = versions[versions.length - 1];
      return m;
    })
    .filter((m): m is AgentMessagePublicType => {
      return (
        m && m.type === "agent_message" && m.parentMessageId === message.sId
      );
    });

  if (agentMessages.length === 0) {
    throw new Error("Failed to retrieve agent message");
  }

  const agentMessage = agentMessages[0];

  return {
    conversation,
    userMessage: message,
    agentMessage,
  };
}

async function collectChunks({
  conversation,
  agentMessage,
  apiKey,
  workspaceId,
}: {
  conversation: ConversationPublicType;
  agentMessage: AgentMessagePublicType;
  apiKey: string;
  workspaceId: string;
}) {
  const url = `${BASE_URL}/api/v1/w/${workspaceId}/assistant/conversations/${conversation.sId}/messages/${agentMessage.sId}/events`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  const res = await fetch(url, {
    method: "GET",
    headers,
  });
  const body = res.body;

  if (!body) {
    throw new Error("No body");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();

  const chunks: string[] = [];

  type AgentEvent =
    | UserMessageErrorEvent
    | AgentErrorEvent
    | AgentActionSuccessEvent
    | GenerationTokensEvent
    | AgentMessageSuccessEvent
    | AgentActionSpecificEvent;
  const terminalEventTypes: AgentEvent["type"][] = [
    "agent_message_success",
    "agent_error",
    "user_message_error",
  ];

  let pendingEvents: AgentEvent[] = [];

  const parser = createParser((event) => {
    if (event.type === "event") {
      if (event.data) {
        const eventData = JSON.parse(event.data);
        pendingEvents.push(eventData.data);
      }
    }
  });

  let receivedTerminalEvent = false;

  for (;;) {
    const { value, done } = await reader.read();
    if (value) {
      const decoded = decoder.decode(value, { stream: true });
      parser.feed(decoded);
      chunks.push(decoded);
      console.log("Chunk", decoded);

      for (const event of pendingEvents) {
        if (terminalEventTypes.includes(event.type)) {
          receivedTerminalEvent = true;
        }
      }
      pendingEvents = [];
    }

    if (done || receivedTerminalEvent) {
      reader.releaseLock();
      return chunks;
    }
  }
}

async function main() {
  const workspaceId = "0ec9852c2f";
  const agentId = "76b4ce8a57";
  const apiKey = process.env.DUST_API_KEY;

  if (!apiKey) {
    throw new Error("DUST_API_KEY is not set");
  }

  console.log("-----------");
  console.log("CREATING CONVERSATION");
  const { conversation, userMessage, agentMessage } = await posMessage({
    apiKey,
    workspaceId,
    agentId,
    messageTxt: "how do I make a model view in android",
  });
  console.log("-----------");

  console.log("STREAMING CHUNKS");
  const chunks = await collectChunks({
    conversation,
    agentMessage,
    apiKey,
    workspaceId,
  });
  console.log("-----------");

  console.log("COLLECTING CHUNKS AGAIN");
  const chunksAgain = await collectChunks({
    conversation,
    agentMessage,
    apiKey,
    workspaceId,
  });

  console.log("-----------");
  console.log("CHECKING CHUNKS");
  const initialChunksSet = new Set(chunks);
  for (const chunk of chunksAgain) {
    if (!initialChunksSet.has(chunk)) {
      console.log("Chunk dropped", chunk);
    }
  }
}

main().catch(console.error);
