import {
  editSkillWithInstructions,
  editSkillWithTool,
  mockTool,
  noSuggestion,
  type TestSuite,
  type WorkspaceContext,
} from "@app/tests/reinforcement-evals/lib/types";

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
    mockTool(
      "Calendar",
      "Manage calendar events, check availability, and schedule meetings"
    ),
  ],
};

export const analyzeConversationSuite: TestSuite = {
  name: "analyze-conversation",
  description:
    "Analyze conversations to generate synthetic suggestions for skill improvements",
  testCases: [
    {
      scenarioId: "unclear-instructions",
      type: "analysis",
      skillConfigs: [
        {
          name: "Meeting Scheduler",
          sId: "skill_meeting_scheduler",
          description: "Helps schedule meetings",
          instructions: "Help with meetings.",
          tools: [{ name: "Calendar", sId: "mcp_calendar" }],
        },
      ],
      conversation: [
        {
          role: "user",
          content: "Can you schedule a meeting with Sarah for tomorrow at 2pm?",
        },
        {
          role: "agent",
          content:
            "I can help with meetings. What would you like me to do exactly?",
        },
        {
          role: "user",
          content:
            "I just told you — schedule a meeting with Sarah tomorrow at 2pm. Why are you asking me again?",
        },
        {
          role: "agent",
          content:
            "I apologize for the confusion. Let me check Sarah's availability for tomorrow at 2pm.",
          actions: [
            {
              functionCallName: "calendar-check-availability",
              status: "succeeded",
              params: { user: "Sarah", date: "tomorrow", time: "2pm" },
              output: '{"available": true}',
            },
            {
              functionCallName: "calendar-create-event",
              status: "succeeded",
              params: {
                title: "Meeting with Sarah",
                date: "tomorrow",
                time: "2pm",
              },
              output: '{"eventId": "evt_123"}',
            },
          ],
        },
        {
          role: "user",
          content:
            "Finally. The instructions for this skill seem really vague.",
          feedback: {
            direction: "down",
            comment:
              "Skill instructions are too vague — it didn't know what to do with a straightforward scheduling request.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [editSkillWithInstructions("skill_meeting_scheduler")],
      judgeCriteria: `The analyst MUST call edit_skill with instructionEdits for skill "skill_meeting_scheduler".
The suggestion should:
- Provide clearer instructions that explain the skill should proactively schedule meetings when given enough information (attendee, date, time)
- Reference that the current instructions ("Help with meetings.") are too vague
- Include guidance on checking availability before scheduling
- Have a meaningful analysis referencing the user's confusion

Score 0 if no edit_skill with instructionEdits call is made.
Score 0-1 if the suggestion doesn't substantially improve the instructions' clarity.
Score 2 if the suggestion improves clarity but misses key details (e.g., check availability first).
Score 3 if the suggestion provides clear, actionable instructions that would prevent the observed confusion.`,
    },
    {
      scenarioId: "missing-tool",
      type: "analysis",
      skillConfigs: [
        {
          name: "Research Assistant",
          sId: "skill_research",
          description:
            "Helps users research topics and find current information",
          instructions:
            "Help users research topics thoroughly. Search for up-to-date information when needed. Cite sources when possible.",
        },
      ],
      conversation: [
        {
          role: "user",
          content:
            "Can you find the latest news about the EU AI Act regulations?",
        },
        {
          role: "agent",
          content:
            "I don't currently have the ability to search the web for real-time information. Based on what I know, the EU AI Act was adopted in 2024, but I may not have the most current developments. Would you like me to help with what I have?",
        },
        {
          role: "user",
          content:
            "That's really frustrating. A research skill without web search is useless for finding current information.",
          feedback: {
            direction: "down",
            comment:
              "Research skill needs web search to be useful for current topics.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [
        editSkillWithTool("skill_research", "mcp_web_search"),
      ],
      judgeCriteria: `The analyst MUST call edit_skill with toolEdits to suggest adding the Web Search tool
(mcp_web_search) to skill "skill_research". The suggestion should:
- Recommend adding Web Search (toolId: mcp_web_search) with action "add"
- Include an analysis explaining that the skill's purpose requires web search for current information
- Reference that the agent couldn't fulfill the user's core request without this capability

Score 0 if no edit_skill with toolEdits call is made.
Score 0-1 if edit_skill with toolEdits is called but with the wrong tool ID or wrong skill ID.
Score 2 if the correct tool is suggested but the analysis is weak.
Score 3 if the correct tool is suggested with a clear, well-reasoned analysis.`,
    },
    {
      scenarioId: "unused-tool",
      type: "analysis",
      skillConfigs: [
        {
          name: "Code Review Helper",
          sId: "skill_code_review",
          description: "Helps review code and suggest improvements",
          instructions:
            "Review code provided by the user. Focus on code quality, potential bugs, and best practices. Suggest improvements.",
          tools: [
            { name: "GitHub", sId: "mcp_github" },
            { name: "Calendar", sId: "mcp_calendar" },
          ],
        },
      ],
      conversation: [
        {
          role: "user",
          content:
            "Can you review this function?\n\nfunction add(a, b) { return a + b; }",
        },
        {
          role: "agent",
          content:
            "Here's my review of the function:\n\n1. **Type safety**: The function lacks type annotations. Consider using TypeScript.\n2. **Edge cases**: No input validation for non-numeric values.\n3. **Naming**: The function name is clear and concise.\n\nSuggested improvement:\n```typescript\nfunction add(a: number, b: number): number {\n  return a + b;\n}\n```",
          actions: [
            {
              functionCallName: "calendar-list-events",
              status: "failed",
              params: {},
              output: "Error: not relevant to the current task",
            },
          ],
        },
        {
          role: "user",
          content:
            "Good review, but why did it try to access my calendar? That's weird for a code review.",
          feedback: {
            direction: "down",
            comment:
              "The Calendar tool has nothing to do with code review and caused a confusing error.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [
        editSkillWithTool("skill_code_review", "mcp_calendar"),
      ],
      judgeCriteria: `The analyst MUST call edit_skill with toolEdits to suggest removing the Calendar tool
(mcp_calendar) from skill "skill_code_review". The suggestion should:
- Recommend removing Calendar (toolId: mcp_calendar) with action "remove"
- Include an analysis explaining that Calendar is irrelevant to code review and caused confusion
- Reference the failed tool call and user complaint

Score 0 if no edit_skill with toolEdits call is made.
Score 0-1 if edit_skill with toolEdits is called but with the wrong action (add instead of remove).
Score 2 if the correct tool removal is suggested but the analysis is weak.
Score 3 if the correct removal is suggested with a clear analysis referencing the confusion it caused.`,
    },
    {
      scenarioId: "instruction-and-tool-gap",
      type: "analysis",
      skillConfigs: [
        {
          name: "Bug Reporter",
          sId: "skill_bug_reporter",
          description: "Helps file bug reports from user descriptions",
          instructions:
            "When a user describes a bug, create a well-structured bug report with steps to reproduce, expected behavior, and actual behavior. File the bug report in the project tracker.",
        },
      ],
      conversation: [
        {
          role: "user",
          content:
            "The login page crashes when I enter a special character in the password field. Can you file a bug for this?",
        },
        {
          role: "agent",
          content:
            "I've prepared a bug report:\n\n**Title**: Login page crash on special characters in password\n**Steps to reproduce**: Enter a special character in the password field on the login page\n**Expected**: Password field accepts special characters\n**Actual**: Page crashes\n\nHowever, I don't have access to a project tracker to file this. You'll need to copy this into JIRA or your tracker manually.",
        },
        {
          role: "user",
          content:
            "The instructions say to file it in the tracker but the skill can't actually do that. Pretty broken.",
          feedback: {
            direction: "down",
            comment:
              "Skill promises to file bugs but has no tool to do it. Instructions and tools are mismatched.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [
        editSkillWithInstructions("skill_bug_reporter"),
        editSkillWithTool("skill_bug_reporter", "mcp_jira"),
      ],
      judgeCriteria: `The analyst MUST make BOTH types of suggestions for skill "skill_bug_reporter":
1. edit_skill with instructionEdits to update instructions to reference the JIRA tool for filing
2. edit_skill with toolEdits to add JIRA (mcp_jira) so the skill can actually file bugs

The suggestions should be co-dependent — the instructions should reference using JIRA,
and the tool addition provides the capability.

Score 0 if only one type of suggestion is made.
Score 1 if both are made but the instructions don't reference the tool, or the analysis is weak.
Score 2 if both are made with decent analysis but the instruction/tool connection isn't explicit.
Score 3 if both are made with clear co-dependency: instructions reference JIRA, tool provides the capability, and analysis explains the mismatch.`,
    },
    {
      scenarioId: "successful-conversation",
      type: "analysis",
      skillConfigs: [
        {
          name: "Data Lookup",
          sId: "skill_data_lookup",
          description: "Looks up data in Notion for the team",
          instructions:
            "Search Notion for the requested information. Present findings clearly with source references. If multiple results match, show the most relevant ones.",
          tools: [{ name: "Notion", sId: "mcp_notion" }],
        },
      ],
      conversation: [
        {
          role: "user",
          content: "What's the Q1 revenue target for 2026?",
        },
        {
          role: "agent",
          content:
            'According to the "2026 Revenue Targets" page in Notion, the Q1 target is **$2.5M**, representing 15% growth over Q4 2025.',
          actions: [
            {
              functionCallName: "notion-search",
              status: "succeeded",
              params: { query: "Q1 2026 revenue target" },
              output:
                '{"results": [{"title": "2026 Revenue Targets", "content": "Q1: $2.5M (15% QoQ growth)"}]}',
            },
          ],
          feedback: {
            direction: "up",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [noSuggestion()],
      judgeCriteria: `This is a smooth, successful conversation. The skill searched Notion, found accurate data,
cited the source, and presented it clearly. The user gave a thumbs up.

There is nothing to improve — no negative feedback, no tool errors, no confusion.

Score 0 if any substantive suggestion is made.
Score 3 if no suggestion is created (empty suggestions arrays only).`,
    },
    {
      scenarioId: "user-feedback-driven",
      type: "analysis",
      skillConfigs: [
        {
          name: "Email Drafter",
          sId: "skill_email_drafter",
          description: "Drafts professional emails",
          instructions:
            "Draft emails based on user requests. Keep them professional and concise.",
          tools: [{ name: "Slack", sId: "mcp_slack" }],
        },
      ],
      conversation: [
        {
          role: "user",
          content:
            "Draft an email to the client apologizing for the delayed shipment.",
        },
        {
          role: "agent",
          content:
            "Subject: Shipment Delay Notification\n\nDear Customer,\n\nWe regret to inform you that your shipment has been delayed. We are working to resolve this.\n\nRegards,\nThe Team",
        },
        {
          role: "user",
          content:
            "This is way too generic. I need it to sound empathetic and offer a specific remedy, like a discount or expedited shipping. The skill should know our company's tone — we're a premium brand.",
          feedback: {
            direction: "down",
            comment:
              "Email is generic and doesn't match our premium brand voice. Should include specific remedies for delays.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [editSkillWithInstructions("skill_email_drafter")],
      judgeCriteria: `The analyst MUST call edit_skill with instructionEdits for skill "skill_email_drafter".
The suggestion should:
- Add guidance about using a premium, empathetic brand voice
- Include direction to offer specific remedies when addressing complaints
- Reference the user's explicit feedback about generic tone and missing remedies
- Preserve the existing instruction about being professional and concise

Score 0 if no edit_skill with instructionEdits call is made.
Score 0-1 if the suggestion is generic and doesn't address the specific feedback points.
Score 2 if the suggestion addresses tone but misses the remedy guidance (or vice versa).
Score 3 if the suggestion addresses both brand voice and remedy guidance with a clear analysis.`,
    },
  ],
};
