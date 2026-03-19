import {
  mockSkill,
  mockTool,
  type TestSuite,
  type WorkspaceContext,
} from "@app/tests/reinforced-agent-evals/lib/types";
import type {
  AgentInstructionsSuggestionType,
  AgentSkillsSuggestionType,
  AgentToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";

function makeToolSuggestion(
  overrides: Partial<AgentToolsSuggestionType> & {
    id: number;
    sId: string;
    analysis: string;
  }
): AgentToolsSuggestionType {
  return {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agentConfigurationId: 1,
    state: "pending",
    source: "synthetic",
    conversationId: null,
    kind: "tools",
    suggestion: {
      action: "add",
      toolId: "mcp_jira",
    },
    ...overrides,
  };
}

function makeSkillSuggestion(
  overrides: Partial<AgentSkillsSuggestionType> & {
    id: number;
    sId: string;
    analysis: string;
  }
): AgentSkillsSuggestionType {
  return {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agentConfigurationId: 1,
    state: "pending",
    source: "synthetic",
    conversationId: null,
    kind: "skills",
    suggestion: {
      action: "add",
      skillId: "skill_web_search",
    },
    ...overrides,
  };
}

function makeInstructionSuggestion(
  overrides: Partial<AgentInstructionsSuggestionType> & {
    id: number;
    sId: string;
    analysis: string;
    suggestion: AgentInstructionsSuggestionType["suggestion"];
  }
): AgentInstructionsSuggestionType {
  return {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agentConfigurationId: 1,
    state: "pending",
    source: "synthetic",
    conversationId: null,
    kind: "instructions",
    ...overrides,
  };
}

const WORKSPACE_CONTEXT: WorkspaceContext = {
  skills: [
    mockSkill("Web Search", "Search the web for current information"),
    mockSkill("Data Analysis", "Analyze data and generate insights"),
  ],
  tools: [
    mockTool("Slack", "Read and send Slack messages"),
    mockTool("Notion", "Search Notion workspace"),
    mockTool("GitHub", "Access GitHub repositories"),
    mockTool("JIRA", "Search and manage JIRA issues and projects"),
  ],
};

export const aggregateSuggestionsSuite: TestSuite = {
  name: "aggregate-suggestions",
  description:
    "Aggregate multiple synthetic suggestions into merged, prioritised recommendations",
  testCases: [
    {
      scenarioId: "three-jira-tool-suggestions",
      type: "aggregation",
      agentConfig: { name: "Engineering Assistant" },
      syntheticSuggestions: [
        makeToolSuggestion({
          id: 1,
          sId: "sug-1",
          analysis:
            "User asked to create a bug ticket in JIRA but the agent could not interact with JIRA directly. Adding the JIRA tool would let the agent create and manage tickets.",
          suggestion: { action: "add", toolId: "mcp_jira" },
        }),
        makeToolSuggestion({
          id: 2,
          sId: "sug-2",
          analysis:
            "User wanted to check the status of a JIRA sprint. The agent had no way to query JIRA data. The JIRA tool would enable sprint and issue lookups.",
          suggestion: { action: "add", toolId: "mcp_jira" },
        }),
        makeToolSuggestion({
          id: 3,
          sId: "sug-3",
          analysis:
            "User asked to assign a JIRA ticket to a team member. Without the JIRA tool, the agent could only suggest doing it manually. This is a frequent engineering workflow.",
          suggestion: { action: "add", toolId: "mcp_jira" },
        }),
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: ["suggest_tools"],
      judgeCriteria: `The reinforced agent MUST call suggest_tools to suggest adding the JIRA tool
(mcp_jira). The aggregated suggestion should:
- Merge the 3 individual suggestions into a single well-summarized recommendation
- Mention that 3 conversations support this suggestion (or reference multiple use cases)
- Include a comprehensive analysis covering the different use cases (bug tickets, sprint status, ticket assignment)
- Use action "add" with toolId "mcp_jira"

Score 0 if no suggest_tools call or if it creates 3 separate suggestions instead of merging.
Score 1 if merged but analysis doesn't reference multiple conversations/use cases.
Score 2 if properly merged with multi-conversation reference but analysis could be better.
Score 3 if well-merged with clear analysis covering all use cases and conversation count.`,
    },
    {
      scenarioId: "three-websearch-skill-suggestions",
      type: "aggregation",
      agentConfig: { name: "Research Helper" },
      syntheticSuggestions: [
        makeSkillSuggestion({
          id: 1,
          sId: "sug-1",
          analysis:
            "User wanted to find recent articles about climate change policy but the agent could not search the web. Adding the Web Search skill would allow the agent to find current information.",
          suggestion: { action: "add", skillId: "skill_web_search" },
        }),
        makeSkillSuggestion({
          id: 2,
          sId: "sug-2",
          analysis:
            "User needed current market data and stock prices. The agent acknowledged it cannot access real-time web data. The Web Search skill would fulfill this common request.",
          suggestion: { action: "add", skillId: "skill_web_search" },
        }),
        makeSkillSuggestion({
          id: 3,
          sId: "sug-3",
          analysis:
            "User asked for the latest tech news and product announcements. Without web search, the agent could only provide outdated information. This is a core use case for a research assistant.",
          suggestion: { action: "add", skillId: "skill_web_search" },
        }),
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: ["suggest_skills"],
      judgeCriteria: `The reinforced agent MUST call suggest_skills to suggest adding the Web Search
skill (skill_web_search). The aggregated suggestion should:
- Merge the 3 individual suggestions into a single well-summarized recommendation
- Mention that 3 conversations support this suggestion (or reference multiple use cases)
- Include a comprehensive analysis covering the different use cases (climate research, market data, tech news)
- Use action "add" with skillId "skill_web_search"

Score 0 if no suggest_skills call or if it creates 3 separate suggestions instead of merging.
Score 1 if merged but analysis doesn't reference multiple conversations/use cases.
Score 2 if properly merged with multi-conversation reference but analysis could be better.
Score 3 if well-merged with clear analysis covering all use cases and conversation count.`,
    },
    {
      scenarioId: "three-tone-prompt-suggestions",
      type: "aggregation",
      agentConfig: { name: "Support Agent" },
      syntheticSuggestions: [
        makeInstructionSuggestion({
          id: 1,
          sId: "sug-1",
          analysis:
            "Users found the agent's responses too cold and impersonal. The agent should adopt a warmer, more friendly communication style to improve user satisfaction.",
          suggestion: {
            content:
              "<h2>Communication Style</h2><p>Always respond in a warm, friendly tone. Use a conversational style that makes users feel welcome and valued.</p>",
            targetBlockId: "instructions-root",
            type: "replace",
          },
        }),
        makeInstructionSuggestion({
          id: 2,
          sId: "sug-2",
          analysis:
            "User complained about robotic and formulaic language. The agent should use more natural, human-like language patterns and avoid overly technical jargon.",
          suggestion: {
            content:
              "<h2>Language Guidelines</h2><p>Use natural, human-like language. Avoid robotic or formulaic responses. Explain technical concepts in plain language.</p>",
            targetBlockId: "instructions-root",
            type: "replace",
          },
        }),
        makeInstructionSuggestion({
          id: 3,
          sId: "sug-3",
          analysis:
            "User wanted more empathetic responses when reporting issues. The agent should acknowledge user frustration and show understanding before jumping to solutions.",
          suggestion: {
            content:
              "<h2>Empathy in Responses</h2><p>When users report problems, first acknowledge their frustration. Show understanding and empathy before providing solutions.</p>",
            targetBlockId: "instructions-root",
            type: "replace",
          },
        }),
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: ["suggest_prompt_edits"],
      judgeCriteria: `The reinforced agent MUST call suggest_prompt_edits with a single merged
suggestion that combines all 3 tone-related suggestions. The merged suggestion should:
- Combine the warmth, natural language, and empathy themes into one coherent section
- Mention that 3 conversations support this suggestion
- Provide well-structured HTML content that covers all three aspects
- Target instructions-root since all 3 originals did
- NOT create 3 separate suggestions — they must be merged into one

Score 0 if no suggest_prompt_edits call or if it creates 3 separate suggestions.
Score 1 if merged but missing one or more of the key themes (warmth, natural language, empathy).
Score 2 if all themes included but the merged content is disorganized or the analysis is weak.
Score 3 if well-merged with all themes, clear structure, and analysis referencing multiple conversations.`,
    },
  ],
};
