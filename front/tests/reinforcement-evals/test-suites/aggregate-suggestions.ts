import {
  instructionSuggestion,
  mockTool,
  noSuggestion,
  type TestSuite,
  toolSuggestion,
  type WorkspaceContext,
} from "@app/tests/reinforcement-evals/lib/types";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";

const SKILL_SID = "skill_customer_support";

function makeInstructionSuggestion(input: {
  sId: string;
  analysis: string;
  instructions: string;
  skillConfigurationId?: string;
  source?: "reinforcement" | "synthetic";
}): SkillSuggestionType {
  return {
    sId: input.sId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    skillConfigurationId: input.skillConfigurationId ?? SKILL_SID,
    analysis: input.analysis,
    state: "pending",
    source: input.source ?? "synthetic",
    sourceConversationId: null,
    kind: "edit_instructions",
    suggestion: { instructions: input.instructions },
  };
}

function makeToolSuggestion(input: {
  sId: string;
  analysis: string;
  action: "add" | "remove";
  toolId: string;
  skillConfigurationId?: string;
  source?: "reinforcement" | "synthetic";
}): SkillSuggestionType {
  return {
    sId: input.sId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    skillConfigurationId: input.skillConfigurationId ?? SKILL_SID,
    analysis: input.analysis,
    state: "pending",
    source: input.source ?? "synthetic",
    sourceConversationId: null,
    kind: "tools",
    suggestion: { action: input.action, toolId: input.toolId },
  };
}

const WORKSPACE_CONTEXT: WorkspaceContext = {
  tools: [
    mockTool("Slack", "Read and send Slack messages"),
    mockTool("Notion", "Search Notion workspace"),
    mockTool("GitHub", "Access GitHub repositories"),
    mockTool("JIRA", "Search and manage JIRA issues and projects"),
    mockTool(
      "Web Search",
      "Search the web for current information and real-time data"
    ),
  ],
};

export const aggregateSuggestionsSuite: TestSuite = {
  name: "aggregate-suggestions",
  description:
    "Aggregate multiple synthetic suggestions into merged, prioritised skill recommendations",
  testCases: [
    {
      scenarioId: "merge-duplicate-instructions",
      type: "aggregation",
      skillConfig: {
        name: "Customer Support",
        sId: SKILL_SID,
        description: "Handles customer support inquiries",
        instructions: "Help customers with their questions. Be professional.",
      },
      syntheticSuggestions: [
        makeInstructionSuggestion({
          sId: "sug-1",
          analysis:
            "User complained that the skill's responses were too blunt and impersonal. The instructions should emphasize a warmer, more empathetic tone.",
          instructions:
            "Help customers with their questions. Be professional, warm, and empathetic. Acknowledge the customer's situation before providing solutions.",
        }),
        makeInstructionSuggestion({
          sId: "sug-2",
          analysis:
            "User found the skill's language too robotic. The instructions should guide the skill to use more natural, conversational language.",
          instructions:
            "Help customers with their questions. Be professional and use natural, conversational language. Avoid formulaic or robotic phrasing.",
        }),
        makeInstructionSuggestion({
          sId: "sug-3",
          analysis:
            "User reported the skill jumped straight to solutions without acknowledging the problem. Instructions should include empathy-first guidance.",
          instructions:
            "Help customers with their questions. Be professional. Always acknowledge the customer's frustration before jumping to a solution.",
        }),
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [instructionSuggestion(SKILL_SID)],
      judgeCriteria: `The analyst MUST call suggest_skill_instruction_edits with a single merged suggestion
for skill "${SKILL_SID}". The merged suggestion should:
- Combine all three themes: warmth/empathy, natural language, and acknowledge-first approach
- Mention that 3 conversations support this suggestion
- Provide well-structured instructions covering all three aspects
- NOT create 3 separate suggestions — they must be merged into one

Score 0 if no suggest_skill_instruction_edits call or if it creates 3 separate suggestions.
Score 1 if merged but missing one or more key themes (warmth, natural language, acknowledge-first).
Score 2 if all themes included but the merged instructions are disorganized or analysis is weak.
Score 3 if well-merged with all themes, clear structure, and analysis referencing multiple conversations.`,
    },
    {
      scenarioId: "merge-duplicate-tools",
      type: "aggregation",
      skillConfig: {
        name: "Engineering Helper",
        sId: "skill_engineering",
        description: "Helps engineers with day-to-day tasks",
        instructions:
          "Help engineers with their daily work. Assist with task management and process questions.",
      },
      syntheticSuggestions: [
        makeToolSuggestion({
          sId: "sug-1",
          skillConfigurationId: "skill_engineering",
          analysis:
            "User asked to create a JIRA ticket but the skill couldn't. Adding JIRA would enable direct ticket creation.",
          action: "add",
          toolId: "mcp_jira",
        }),
        makeToolSuggestion({
          sId: "sug-2",
          skillConfigurationId: "skill_engineering",
          analysis:
            "User wanted to check sprint status in JIRA. The skill had no way to query JIRA data.",
          action: "add",
          toolId: "mcp_jira",
        }),
        makeToolSuggestion({
          sId: "sug-3",
          skillConfigurationId: "skill_engineering",
          analysis:
            "User asked to assign a JIRA ticket to a teammate. Without the JIRA tool, the skill could only suggest doing it manually.",
          action: "add",
          toolId: "mcp_jira",
        }),
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [toolSuggestion("skill_engineering", "mcp_jira")],
      judgeCriteria: `The analyst MUST call suggest_skill_tools to suggest adding JIRA (mcp_jira)
to skill "skill_engineering". The aggregated suggestion should:
- Merge the 3 individual suggestions into a single recommendation
- Mention that 3 conversations support this suggestion
- Include a comprehensive analysis covering the different use cases (ticket creation, sprint status, assignment)
- Use action "add" with toolId "mcp_jira"

Score 0 if no suggest_skill_tools call or if it creates 3 separate suggestions.
Score 1 if merged but analysis doesn't reference multiple conversations/use cases.
Score 2 if properly merged with multi-conversation reference but analysis could be better.
Score 3 if well-merged with clear analysis covering all use cases and conversation count.`,
    },
    {
      scenarioId: "dedup-vs-pending",
      type: "aggregation",
      skillConfig: {
        name: "Customer Support",
        sId: SKILL_SID,
        description: "Handles customer support inquiries",
        instructions: "Help customers with their questions. Be professional.",
      },
      syntheticSuggestions: [
        makeInstructionSuggestion({
          sId: "sug-1",
          analysis:
            "User complained about the skill's tone being too cold. The skill should adopt a warmer communication style with more empathy.",
          instructions:
            "Help customers with their questions. Be professional, warm, and empathetic. Show care for the customer's needs.",
        }),
      ],
      existingSuggestions: {
        pending: [
          makeInstructionSuggestion({
            sId: "existing-pending-1",
            source: "reinforcement",
            analysis:
              "Multiple users found responses impersonal. Adding warmth and a friendlier tone would improve satisfaction.",
            instructions:
              "Help customers with their questions. Be professional. Use a warm, conversational tone. Be friendly and approachable. Show genuine care for the user's needs.",
          }),
        ],
        rejected: [],
      },
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [noSuggestion()],
      judgeCriteria: `The synthetic suggestion about tone/warmth is essentially the same as the existing pending
suggestion. The analyst must not duplicate it.

Score 0 if it creates a suggestion similar to the existing pending one (tone/warmth/friendliness).
Score 1 if it creates an unrelated suggestion.
Score 3 if no suggestion is created.`,
    },
    {
      scenarioId: "dedup-vs-rejected",
      type: "aggregation",
      skillConfig: {
        name: "Customer Support",
        sId: SKILL_SID,
        description: "Handles customer support inquiries",
        instructions: "Help customers with their questions. Be professional.",
      },
      syntheticSuggestions: [
        makeInstructionSuggestion({
          sId: "sug-1",
          analysis:
            "User was frustrated that the skill didn't acknowledge their problem before jumping to solutions. The skill should show empathy first.",
          instructions:
            "Help customers with their questions. Be professional. When users report issues, always acknowledge their frustration and show understanding before providing a solution.",
        }),
      ],
      existingSuggestions: {
        pending: [],
        rejected: [
          makeInstructionSuggestion({
            sId: "existing-rejected-1",
            source: "reinforcement",
            analysis:
              "Users wanted more empathetic responses. The skill should acknowledge frustration and show understanding before jumping to solutions.",
            instructions:
              "Help customers with their questions. Be professional. When users report problems, first acknowledge their frustration. Show understanding and empathy before providing solutions.",
          }),
        ],
      },
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [noSuggestion()],
      judgeCriteria: `The synthetic suggestion about empathy/acknowledging frustration is essentially the same
as a previously rejected suggestion. The analyst must not recreate it.

Score 0 if it creates a suggestion similar to the rejected one (empathy/acknowledging frustration).
Score 1 if it creates an unrelated suggestion.
Score 3 if no suggestion is created.`,
    },
    {
      scenarioId: "drop-minor-single",
      type: "aggregation",
      skillConfig: {
        name: "Writing Assistant",
        sId: "skill_writing",
        description: "Helps with writing tasks",
        instructions:
          "Help users write and edit text. Focus on clarity and correctness.",
      },
      syntheticSuggestions: [
        makeInstructionSuggestion({
          sId: "sug-1",
          skillConfigurationId: "skill_writing",
          analysis:
            "User found responses slightly long. The skill tends to include one or two unnecessary filler sentences at the end.",
          instructions:
            "Help users write and edit text. Focus on clarity and correctness. Keep responses concise. Avoid unnecessary filler sentences.",
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
  ],
};
