import type { Tool, ToolContext } from "./index.js";

export function callDustAgentTool(context: ToolContext): Tool {
  return {
    name: "call_dust_agent",
    description:
      "Call a Dust workspace agent to delegate tasks to specialized agents. " +
      "Use this to leverage agents configured in your Dust workspace " +
      "(e.g., @security-auditor, @code-reviewer, @docs-writer). " +
      "The agent will receive your message and return a response.",
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description:
            'Agent name or sId. Use the name with @ prefix (e.g. "@security-auditor") ' +
            "or the agent sId directly.",
        },
        message: {
          type: "string",
          description: "The message to send to the agent.",
        },
        context: {
          type: "string",
          description:
            "Optional additional context to include (e.g., code snippets, file contents).",
        },
      },
      required: ["agent", "message"],
    },
    async execute(input) {
      const dustClient = context.dustClient;
      if (!dustClient) {
        return "Error: Dust client not available. Cannot call workspace agents.";
      }

      const agentName = (input.agent as string).replace(/^@/, "");
      const message = input.message as string;
      const additionalContext = input.context as string | undefined;

      // Resolve agent by name.
      const agentsRes = await dustClient.getAgentConfigurations({ view: "list" });
      if (agentsRes.isErr()) {
        return `Error fetching agent configurations: ${agentsRes.error.message}`;
      }

      const agents = agentsRes.value;
      const agent = agents.find(
        (a) =>
          a.name.toLowerCase() === agentName.toLowerCase() ||
          a.sId === agentName
      );

      if (!agent) {
        const available = agents
          .slice(0, 20)
          .map((a) => `@${a.name}`)
          .join(", ");
        return `Error: Agent "${agentName}" not found. Available agents: ${available}`;
      }

      // Build the full message content.
      let fullMessage = message;
      if (additionalContext) {
        fullMessage += `\n\n---\nContext:\n${additionalContext}`;
      }

      // Create conversation with the agent.
      const convRes = await dustClient.createConversation({
        title: null,
        visibility: "unlisted",
        message: {
          content: fullMessage,
          mentions: [{ configurationId: agent.sId }],
          context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            username: "coding-cli",
            fullName: null,
            email: null,
            profilePictureUrl: null,
            origin: "api" as const,
          },
        },
      });

      if (convRes.isErr()) {
        return `Error creating conversation: ${convRes.error.message}`;
      }

      const { conversation, message: userMessage } = convRes.value;

      if (!userMessage) {
        return "Error: No user message was created.";
      }

      // Stream the agent's response.
      const streamRes = await dustClient.streamAgentAnswerEvents({
        conversation,
        userMessageId: userMessage.sId,
      });

      if (streamRes.isErr()) {
        const err = streamRes.error;
        const errMessage = err instanceof Error ? err.message : String(err);
        return `Error streaming agent response: ${errMessage}`;
      }

      const { eventStream } = streamRes.value;

      let responseText = "";

      for await (const event of eventStream) {
        if (event.type === "generation_tokens" && "text" in event) {
          responseText += event.text;
        }
        if (event.type === "agent_error") {
          return `Agent error: ${event.error.message}`;
        }
      }

      if (!responseText) {
        return "Agent returned an empty response.";
      }

      return responseText;
    },
  };
}
