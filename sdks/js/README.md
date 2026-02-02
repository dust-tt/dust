<div align="center">
    <h1>Dust SDK for JavaScript</h1>
    <p>
        <b>A simple and easy to use client for the <a href="https://docs.dust.tt/reference/developer-platform-overview">Dust API</a></b>
    </p>
    <br>
</div>

![Build status](https://github.com/dust-tt/dust/actions/workflows/deploy-front.yml/badge.svg)
[![npm version](https://badge.fury.io/js/%40dust%2Fclient.svg)](https://www.npmjs.com/package/@dust-tt/client)

Source code available [here](https://github.com/dust-tt/dust/tree/main/sdks/js).

## Installation

```js
npm install @dust-tt/client
```

## Usage

> Use Dust's [Dust Development Platform](https://docs.dust.tt/reference/developer-platform-overview) to start learning about Dust API.

Import and initialize a client using an **workspace api key** or an OAuth **access token** (for now, requires talking to us).

Note: we use the Result pattern to handle errors ([see more](https://velocidadescape.com/js/result-pattern-try-catch/)).

### Quickstart (High-level API)

```js
import { DustAPI } from "@dust-tt/client";

const dust = new DustAPI({
  workspaceId: "YOUR_WORKSPACE_ID",
  apiKey: process.env.DUST_API_KEY,
});

const response = await dust.agents.sendMessage({
  agentId: "YOUR_AGENT_ID",
  message: "Hello!",
});

console.log(response.text);
```

High-level methods throw typed errors. Wrap calls in `try/catch` for custom handling:

- `DustAuthenticationError` - Invalid/missing API key, authentication failures
- `DustRateLimitError` - Rate limits hit (includes `retryAfterSeconds` hint)
- `DustValidationError` - Invalid request parameters, unsupported file types
- `DustAgentError` - Agent execution failures
- `DustConnectionError` - Network/connection issues (automatically retried)
- `DustInternalError` - Server-side errors
- `DustResourceError` - Resource not found (data source, conversation, etc.)
- `DustPlanLimitError` - Plan/subscription limits exceeded
- `DustAPIError` - Base class for other API errors

### Streaming

```js
const stream = dust.agents
  .streamMessage({
    agentId: "YOUR_AGENT_ID",
    message: "Write a short poem about the ocean.",
  })
  .on("text", (delta) => process.stdout.write(delta))
  .on("action", (action) => {
    // Tool call or action metadata
  })
  .on("chainOfThought", (delta) => {
    // Optional reasoning stream (if available)
  })
  .on("error", (error) => {
    // Typed errors (DustAPIError)
  });

const final = await stream.finalMessage();
console.log(final.text);
```

### Setup (Low-level Result-based API)

```js
import { DustAPI } from "@dust-tt/client";

const dustAPI = new DustAPI(
  {
    url: "https://dust.tt",
  },
  {
    workspaceId: "YOUR_WORKSPACE_ID",
    apiKey: "YOUR_API_KEY_OR_ACCESS_TOKEN",
  },
  console,
);
```

### Get all agents

```js
const r = await dustApi.getAgentConfigurations();

if (r.isErr()) {
  throw new Error(`API Error: ${r.error.message}`);
} else {
  const agents = r.value.filter((agent) => agent.status === "active");
}
```

### Create a conversation

```js
const context = {
  timezone: "UTC",
  username: user.firstName,
  email: user.email,
  fullName: user.fullName,
  profilePictureUrl: user.image,
  origin: "api", // Contact us to add more
};

const question = "Hello! What can you do for me ?";

const r = await dustApi.createConversation({
  title: null,
  visibility: "unlisted",
  message: {
    content: question,
    mentions: [
      {
        configurationId: agent.sId,
      },
    ],
    context,
  },
});

if (r.isErr()) {
  throw new Error(r.error.message);
} else {
  const { conversation, message } = r.value;

  try {
    const r = await dustApi.streamAgentAnswerEvents({
      conversation,
      userMessageId: message.sId,
      signal,
    });
    if (r.isErr()) {
      throw new Error(r.error.message);
    } else {
      const { eventStream } = r.value;

      let answer = "";
      let action: AgentActionPublicType | undefined = undefined;
      let chainOfThought = "";

      for await (const event of eventStream) {
        if (!event) {
          continue;
        }
        switch (event.type) {
          case "user_message_error": {
            console.error(
              `User message error: code: ${event.error.code} message: ${event.error.message}`
            );
            return;
          }
          case "agent_error": {
            console.error(
              `Agent message error: code: ${event.error.code} message: ${event.error.message}`
            );
            return;
          }
          case "agent_action_success": {
            action = event.action;
            break;
          }

          case "generation_tokens": {
            if (event.classification === "tokens") {
              answer = (answer + event.text).trim();
            } else if (event.classification === "chain_of_thought") {
              chainOfThought += event.text;
            }
            break;
          }
          case "agent_message_success": {
            answer = event.message.content ?? "";
            break;
          }
          default:
          // Nothing to do on unsupported events
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("AbortError")) {
      // Stream aborted
    } else {
      // Other error
    }
  }
}
```
