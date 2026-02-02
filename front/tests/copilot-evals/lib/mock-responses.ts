import { ONE_DAY_MS, ONE_HOUR_MS } from "@app/tests/copilot-evals/lib/config";
import type { MockAgentState } from "@app/tests/copilot-evals/lib/types";

export function getMockToolResponse(
  toolName: string,
  agentState: MockAgentState
): string {
  const mockResponses: Record<string, () => object> = {
    get_agent_info: () => agentState,

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
      ],
    }),

    get_available_knowledge: () => ({
      count: {
        spaces: 2,
        dataSources: 4,
      },
      spaces: [
        {
          sId: "space_1",
          name: "Engineering",
          kind: "team",
          categories: [
            {
              displayName: "Connected Data Sources",
              dataSources: [
                {
                  sId: "ds_notion_1",
                  name: "Engineering Wiki",
                  description: "Notion workspace for engineering documentation",
                  type: "notion",
                },
                {
                  sId: "ds_slack_1",
                  name: "Engineering Slack",
                  description: "Slack workspace for engineering team",
                  type: "slack",
                },
              ],
            },
            {
              displayName: "Folders",
              dataSources: [
                {
                  sId: "ds_folder_1",
                  name: "Product Requirements",
                  description:
                    "Folder containing product requirement documents",
                  type: "folder",
                },
              ],
            },
          ],
        },
        {
          sId: "space_2",
          name: "Marketing",
          kind: "team",
          categories: [
            {
              displayName: "Websites",
              dataSources: [
                {
                  sId: "ds_website_1",
                  name: "Company Blog",
                  description: "Crawled website: company blog",
                  type: "website",
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

    suggest_prompt_edits: () => ({
      status: "success",
      suggestionsCreated: 1,
      message: "Suggestion created successfully",
    }),

    suggest_tools: () => ({
      status: "success",
      suggestionsCreated: 1,
      message: "Tool suggestion created successfully",
    }),

    suggest_skills: () => ({
      status: "success",
      suggestionsCreated: 1,
      message: "Skill suggestion created successfully",
    }),

    suggest_model: () => ({
      status: "success",
      suggestionsCreated: 1,
      message: "Model suggestion created successfully",
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

  return JSON.stringify(responseFactory(), null, 2);
}
