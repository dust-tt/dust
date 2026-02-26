import { ONE_DAY_MS, ONE_HOUR_MS } from "@app/tests/copilot-evals/lib/config";
import type { MockAgentState } from "@app/tests/copilot-evals/lib/types";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";

function instructionsToHtml(instructions: string): string {
  if (!instructions.trim()) {
    return `<div data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"><p></p></div>`;
  }
  const paragraphs = instructions.split("\n").map((line) => line.trim());
  const blocks = paragraphs
    .map((p, i) => `<p data-block-id="mock-${i}">${p}</p>`)
    .join("");
  return `<div data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">${blocks}</div>`;
}

let mockSuggestionCounter = 0;

function getSuggestionsArray(
  toolArguments: Record<string, unknown> | undefined
): unknown[] {
  const raw = toolArguments?.suggestions;
  return Array.isArray(raw) ? raw : [null];
}

export function getMockToolResponse(
  toolName: string,
  agentState: MockAgentState,
  toolArguments?: Record<string, unknown>
): string {
  const mockResponses: Record<string, () => object | string> = {
    get_agent_info: () => agentState,

    get_agent_config: () => ({
      name: agentState.name,
      description: agentState.description,
      instructionsHtml: instructionsToHtml(agentState.instructions),
      scope: agentState.scope ?? "private",
      model: {
        modelId: agentState.model.modelId,
        providerId: "anthropic",
        temperature: agentState.model.temperature ?? 0.7,
        reasoningEffort: agentState.model.reasoningEffort ?? null,
      },
      tools: agentState.tools,
      skills: agentState.skills,
      maxStepsPerRun: agentState.maxStepsPerRun ?? 8,
      pendingSuggestions: [],
    }),

    get_available_models: () => ({
      models: [
        { modelId: "gpt-4-turbo", providerId: "openai", name: "GPT-4 Turbo" },
        { modelId: "gpt-5-mini", providerId: "openai", name: "GPT-5 Mini" },
        {
          modelId: "claude-sonnet-4-5-20250929",
          providerId: "anthropic",
          name: "Claude Sonnet 4.5",
        },
        {
          modelId: "claude-opus-4-20250514",
          providerId: "anthropic",
          name: "Claude Opus 4",
        },
      ],
    }),

    get_available_skills: () => ({
      skills: [
        {
          sId: "skill_web_search",
          name: "Web Search",
          description: "Search the web for information",
        },
        {
          sId: "skill_data_analysis",
          name: "Data Analysis",
          description: "Analyze data and generate insights",
        },
      ],
    }),

    get_available_tools: () => ({
      tools: [
        {
          sId: "mcp_slack",
          name: "Slack",
          description: "Read and send Slack messages",
        },
        {
          sId: "mcp_notion",
          name: "Notion",
          description: "Search Notion workspace",
        },
        {
          sId: "mcp_github",
          name: "GitHub",
          description: "Access GitHub repositories",
        },
        {
          sId: "mcp_datadog",
          name: "Datadog",
          description: "Search and query Datadog logs and metrics",
        },
        {
          sId: "mcp_jira",
          name: "JIRA",
          description: "Search and manage JIRA issues and projects",
        },
      ],
    }),

    get_available_knowledge: () => ({
      count: {
        spaces: 3,
        dataSources: 6,
      },
      spaces: [
        {
          sId: "space_1",
          name: "Engineering",
          kind: "regular",
          categories: [
            {
              category: "managed",
              displayName: "Connected data",
              dataSources: [
                {
                  sId: "dsv_notion_1",
                  name: "Notion",
                  connectorProvider: "notion",
                },
                {
                  sId: "dsv_slack_1",
                  name: "Slack",
                  connectorProvider: "slack",
                },
              ],
            },
            {
              category: "folder",
              displayName: "Folders",
              dataSources: [
                {
                  sId: "dsv_folder_1",
                  name: "Product Requirements",
                  connectorProvider: null,
                },
              ],
            },
          ],
        },
        {
          sId: "space_2",
          name: "Marketing",
          kind: "regular",
          categories: [
            {
              category: "website",
              displayName: "Websites",
              dataSources: [
                {
                  sId: "dsv_website_1",
                  name: "Company Blog",
                  connectorProvider: "webcrawler",
                },
              ],
            },
          ],
        },
        {
          sId: "space_3",
          name: "Company Data",
          kind: "global",
          categories: [
            {
              category: "managed",
              displayName: "Connected data",
              dataSources: [
                {
                  sId: "dsv_snowflake_1",
                  name: "Snowflake",
                  connectorProvider: "snowflake",
                },
                {
                  sId: "dsv_github_1",
                  name: "GitHub",
                  connectorProvider: "github",
                },
              ],
            },
          ],
        },
      ],
    }),

    get_agent_feedback: () => ({
      feedback: [
        {
          id: "fb1",
          thumbDirection: "down",
          content: "The agent's responses are too formal and robotic",
          createdAt: Date.now() - ONE_DAY_MS,
        },
        {
          id: "fb2",
          thumbDirection: "up",
          content: "Great at finding relevant information quickly",
          createdAt: Date.now() - ONE_DAY_MS * 2,
        },
        {
          id: "fb3",
          thumbDirection: "down",
          content: "Sometimes misses important context from previous messages",
          createdAt: Date.now() - ONE_DAY_MS * 3,
        },
      ],
      total: 3,
    }),

    get_agent_insights: () => ({
      activeUsers: 15,
      conversations: 48,
      messages: 320,
      feedbackStats: {
        thumbsUp: 12,
        thumbsDown: 8,
        thumbsUpRate: 0.6,
      },
      topUsers: [
        { userId: "user1", name: "Alice Smith", conversations: 12 },
        { userId: "user2", name: "Bob Johnson", conversations: 8 },
      ],
    }),

    suggest_prompt_edits: () =>
      getSuggestionsArray(toolArguments)
        .map(() => {
          const sId = `mock_sId_${++mockSuggestionCounter}`;
          return `:agent_suggestion[]{sId=${sId} kind=instructions}`;
        })
        .join("\n\n"),

    suggest_tools: () =>
      getSuggestionsArray(toolArguments)
        .map(() => {
          const sId = `mock_sId_${++mockSuggestionCounter}`;
          return `:agent_suggestion[]{sId=${sId} kind=tools}`;
        })
        .join("\n\n"),

    suggest_skills: () =>
      getSuggestionsArray(toolArguments)
        .map(() => {
          const sId = `mock_sId_${++mockSuggestionCounter}`;
          return `:agent_suggestion[]{sId=${sId} kind=skills}`;
        })
        .join("\n\n"),

    suggest_model: () =>
      `:agent_suggestion[]{sId=mock_sId_${++mockSuggestionCounter} kind=model}`,

    suggest_knowledge: () =>
      `:agent_suggestion[]{sId=mock_sId_${++mockSuggestionCounter} kind=knowledge}`,

    suggest_sub_agent: () =>
      `:agent_suggestion[]{sId=mock_sId_${++mockSuggestionCounter} kind=sub_agent}`,

    search_knowledge: () => ({
      results: [
        {
          dataSourceViewId: "ds_notion_1",
          dataSourceName: "Engineering Wiki",
          hitCount: 5,
          documents: [
            { title: "Product FAQ", score: 0.92 },
            { title: "Troubleshooting Guide", score: 0.88 },
          ],
        },
      ],
    }),

    search_agent_templates: () => ({
      templates: [
        {
          sId: "template_support",
          handle: "customer-support",
          description: "A customer support agent template",
          tags: ["support"],
          copilotInstructions: "Help users set up a customer support agent.",
        },
      ],
    }),

    get_agent_template: () => ({
      sId: "template_support",
      handle: "customer-support",
      description: "A customer support agent template",
      copilotInstructions: "Help users set up a customer support agent.",
    }),

    get_available_agents: () => ({
      agents: [
        {
          sId: "agent_1",
          name: "Research Assistant",
          description: "Helps with research tasks",
        },
      ],
    }),

    inspect_available_agent: () => ({
      sId: "agent_1",
      name: "Research Assistant",
      description: "Helps with research tasks",
      instructions: "You are a research assistant.",
      tools: [],
      skills: [],
    }),

    update_suggestions_state: () => ({
      status: "success",
      message: "Suggestions updated successfully",
    }),

    inspect_conversation: () => ({
      title: "Mock conversation",
      messages: [],
    }),

    inspect_message: () => ({
      id: "msg_1",
      role: "user",
      content: "Mock message content",
    }),

    list_suggestions: () => ({
      suggestions: [
        {
          id: "sug1",
          kind: "instructions",
          status: "pending",
          createdAt: Date.now() - ONE_HOUR_MS,
          analysis: "Make tone more friendly based on user feedback",
        },
      ],
      total: 1,
    }),
  };

  const responseFactory = mockResponses[toolName];
  if (!responseFactory) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const result = responseFactory();

  // Suggestion tools return plain-text directives, not JSON objects.
  if (typeof result === "string") {
    return result;
  }

  return JSON.stringify(result, null, 2);
}
