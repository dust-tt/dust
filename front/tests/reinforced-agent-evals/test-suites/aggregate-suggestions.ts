import {
  mockSkill,
  mockTool,
  noSuggestion,
  promptSuggestion,
  skillSuggestion,
  type TestSuite,
  toolSuggestion,
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
    mockTool("GitHub", "Access GitHub repositories and pull requests"),
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
      expectedToolCalls: [toolSuggestion("mcp_jira")],
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
      expectedToolCalls: [skillSuggestion("skill_web_search")],
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
      expectedToolCalls: [promptSuggestion()],
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
    {
      scenarioId: "no-duplicate-of-pending-prompt-suggestion",
      type: "aggregation",
      agentConfig: { name: "Support Agent" },
      syntheticSuggestions: [
        makeInstructionSuggestion({
          id: 1,
          sId: "sug-1",
          analysis:
            "User complained about the agent's tone being too cold. The agent should adopt a warmer communication style with more empathy.",
          suggestion: {
            content:
              "<h2>Communication Style</h2><p>Always respond in a warm, friendly tone. Show empathy and make users feel welcome.</p>",
            targetBlockId: "instructions-root",
            type: "replace",
          },
        }),
      ],
      existingSuggestions: {
        pending: [
          makeInstructionSuggestion({
            id: 100,
            sId: "existing-pending-1",
            analysis:
              "Multiple users found the agent's responses impersonal. Adding warmth and a friendlier tone would improve user satisfaction.",
            source: "reinforcement",
            suggestion: {
              content:
                "<h2>Tone Guidelines</h2><p>Use a warm, conversational tone. Be friendly and approachable in all responses. Show genuine care for the user's needs.</p>",
              targetBlockId: "instructions-root",
              type: "replace",
            },
          }),
        ],
        rejected: [],
      },
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [noSuggestion()],
      judgeCriteria: `The synthetic suggestion about tone/warmth is essentially the same as the existing pending
suggestion already targeting instructions-root. The agent must not duplicate it.

Score 0 if it creates a suggestion similar to the existing pending one (tone/warmth/friendliness).
Score 1 if it creates an unrelated suggestion.
Score 3 if no suggestion is created.`,
    },
    {
      scenarioId: "no-duplicate-of-pending-tool-suggestion",
      type: "aggregation",
      agentConfig: { name: "Team Comms Bot" },
      syntheticSuggestions: [
        makeToolSuggestion({
          id: 1,
          sId: "sug-1",
          analysis:
            "User wanted the agent to post a summary directly to Slack after a meeting but the agent could not. Adding the Slack tool would enable direct posting.",
          suggestion: { action: "add", toolId: "mcp_slack" },
        }),
      ],
      existingSuggestions: {
        pending: [
          makeToolSuggestion({
            id: 100,
            sId: "existing-pending-1",
            analysis:
              "A previous conversation showed the agent could not send Slack messages. The Slack tool would allow the agent to post updates and summaries directly.",
            source: "reinforcement",
            suggestion: { action: "add", toolId: "mcp_slack" },
          }),
        ],
        rejected: [],
      },
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [noSuggestion()],
      judgeCriteria: `The synthetic suggestion recommends adding the Slack tool (mcp_slack), but an identical
suggestion is already pending. The agent must not duplicate it.

Score 0 if it creates a new suggest_tools call for mcp_slack.
Score 3 if no suggestion is created.`,
    },
    {
      scenarioId: "no-suggest-on-single-minor-synthetic",
      type: "aggregation",
      agentConfig: { name: "Writing Assistant" },
      syntheticSuggestions: [
        makeInstructionSuggestion({
          id: 1,
          sId: "sug-1",
          analysis:
            "User found the agent's responses slightly long. The agent tends to include one or two unnecessary filler sentences at the end of responses.",
          suggestion: {
            content:
              "<p>Keep responses concise. Avoid unnecessary filler sentences at the end.</p>",
            targetBlockId: "instructions-root",
            type: "replace",
          },
        }),
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [noSuggestion()],
      judgeCriteria: `There is only one synthetic suggestion from a single conversation, and the issue is minor
(slight verbosity / filler sentences — a style preference). According to prioritisation rules,
low-severity issues from a single conversation should be dropped.

Score 0 if it creates any suggestion based on this single minor synthetic input.
Score 3 if no suggestion is created (correct: single low-severity conversation is insufficient evidence).`,
    },
    {
      scenarioId: "suggest-on-single-major-synthetic",
      type: "aggregation",
      agentConfig: { name: "GitHub Assistant" },
      syntheticSuggestions: [
        makeInstructionSuggestion({
          id: 1,
          sId: "sug-1",
          analysis:
            "The agent called github__get_pull_request with the PR title as the pull_number parameter, receiving a 422 validation error. It retried twice with the same mistake before giving up. The instructions must clarify that pull_number is a numeric ID (e.g. 1234), not the PR title string.",
          suggestion: {
            content:
              "<p>When calling github__get_pull_request, always use the numeric pull request ID for the pull_number parameter, not the PR title or branch name.</p>",
            targetBlockId: "instructions-root",
            type: "replace",
          },
        }),
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [promptSuggestion()],
      judgeCriteria: `There is only one synthetic suggestion but it describes a critical issue: a repeated tool
failure caused by passing the wrong parameter type, resulting in 422 errors. Critical issues
(tool failures, wrong parameter format) must be surfaced even from a single conversation.

Score 0 if no suggest_prompt_edits call is made.
Score 1 if a suggestion is made but doesn't address the wrong parameter type for pull_number.
Score 2 if the suggestion is correct but the analysis doesn't reference the tool failure as the reason for acting on a single conversation.
Score 3 if the suggestion targets the tool call instruction and the analysis clearly cites the critical tool failure.`,
    },
    {
      scenarioId: "no-duplicate-of-rejected-prompt-suggestion",
      type: "aggregation",
      agentConfig: { name: "Support Agent" },
      syntheticSuggestions: [
        makeInstructionSuggestion({
          id: 1,
          sId: "sug-1",
          analysis:
            "User was frustrated that the agent didn't acknowledge their problem before jumping to solutions. The agent should show empathy first.",
          suggestion: {
            content:
              "<h2>Empathy First</h2><p>When users report issues, always acknowledge their frustration and show understanding before providing a solution.</p>",
            targetBlockId: "instructions-root",
            type: "replace",
          },
        }),
      ],
      existingSuggestions: {
        pending: [],
        rejected: [
          makeInstructionSuggestion({
            id: 200,
            sId: "existing-rejected-1",
            analysis:
              "Users wanted more empathetic responses. The agent should acknowledge frustration and show understanding before jumping to solutions.",
            source: "reinforcement",
            suggestion: {
              content:
                "<h2>Empathetic Responses</h2><p>When users report problems, first acknowledge their frustration. Show understanding and empathy before providing solutions.</p>",
              targetBlockId: "instructions-root",
              type: "replace",
            },
          }),
        ],
      },
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [noSuggestion()],
      judgeCriteria: `The synthetic suggestion about empathy/acknowledging frustration is essentially the same
as a previously rejected suggestion targeting instructions-root. The agent must not recreate it.

Score 0 if it creates a suggestion similar to the rejected one (empathy/acknowledging frustration).
Score 1 if it creates an unrelated suggestion.
Score 3 if no suggestion is created.`,
    },
  ],
};
