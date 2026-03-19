import {
  mockSkill,
  mockTool,
  promptSuggestion,
  skillSuggestion,
  type TestSuite,
  toolSuggestion,
  type WorkspaceContext,
} from "@app/tests/reinforced-agent-evals/lib/types";

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

export const analyzeConversationSuite: TestSuite = {
  name: "analyze-conversation",
  description:
    "Analyze conversations to generate synthetic suggestions (tone, missing tools/skills)",
  testCases: [
    {
      scenarioId: "bad-tone-user-requests-warmth",
      type: "analysis",
      agentConfig: {
        name: "Customer Support Bot",
        description: "Helps customers with account and product questions",
        instructionsHtml:
          "<p>Answer customer questions about our product. Help with account issues, billing, and technical support.</p>",
      },
      conversation: [
        { role: "user", content: "Hi, how do I reset my password?" },
        {
          role: "agent",
          content:
            "Go to Settings. Click Reset Password. Enter your email. Done.",
        },
        {
          role: "user",
          content:
            "Wow, that was pretty blunt. Could you be more friendly and warm when helping me? I'm a paying customer after all.",
        },
        {
          role: "agent",
          content:
            'I apologize for the tone. Here\'s how to reset your password:\n1. Navigate to your Account Settings\n2. Click on "Security" in the left sidebar\n3. Select "Reset Password"\n4. You\'ll receive an email with a secure reset link\n\nIs there anything else I can help you with today?',
          feedback: {
            direction: "down",
            comment:
              "The first response was way too curt. The agent should always be friendly and warm.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [promptSuggestion()],
      judgeCriteria: `The reinforced agent MUST call suggest_prompt_edits with a suggestion that adds
a section about tone and communication style to the agent's instructions. The suggestion should:
- Include guidance about being friendly, warm, and empathetic
- Reference that users have complained about curt/blunt responses
- Be in HTML format targeting instructions-root or the existing block
- Have a meaningful analysis explaining why tone matters for customer support

Score 0 if no suggest_prompt_edits call is made.
Score 0-1 if the suggestion is generic and doesn't specifically address tone/warmth.
Score 2 if the suggestion addresses tone but is too vague or too prescriptive.
Score 3 if the suggestion provides clear, specific tone guidance that would prevent the observed issue.`,
    },
    {
      scenarioId: "missing-websearch-skill",
      type: "analysis",
      agentConfig: {
        name: "Research Assistant",
        description:
          "Helps users with research questions and finding information",
        instructionsHtml:
          "<p>Help users with their research questions. Provide thorough, well-sourced answers. Summarize findings clearly and concisely.</p>",
      },
      conversation: [
        {
          role: "user",
          content:
            "Can you search the web for the latest news about AI regulations in the EU?",
        },
        {
          role: "agent",
          content:
            "I apologize, but I don't currently have the ability to search the web for real-time information. I can only help with information from the knowledge sources I have access to.\n\nBased on my existing knowledge, I know that the EU has been working on the AI Act, but I may not have the most up-to-date information on recent developments.\n\nWould you like me to help with what I know, or is there another way I can assist you?",
        },
        {
          role: "user",
          content:
            "That's really disappointing. I specifically need current web search results for my research report. This agent should definitely have web search capability.",
        },
        {
          role: "agent",
          content:
            "I understand your frustration. Unfortunately, I'm not equipped with web search at the moment. I'd recommend using a search engine directly for the most current information on EU AI regulations.",
          feedback: {
            direction: "down",
            comment:
              "Research assistant without web search is useless for my needs.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [skillSuggestion("skill_web_search")],
      judgeCriteria: `The reinforced agent MUST call suggest_skills to suggest adding the web search
skill (skill_web_search). The suggestion should:
- Recommend adding web search (ID: skill_web_search) with action "add"
- Include an analysis explaining that the user explicitly needed web search for research
- Reference that the agent couldn't fulfill the user's core request without this capability

Score 0 if no suggest_skills call is made.
Score 0-1 if suggest_skills is called but with the wrong skill ID or wrong action.
Score 2 if the correct skill is suggested but the analysis is weak.
Score 3 if the correct skill is suggested with a clear, well-reasoned analysis.`,
    },
    {
      scenarioId: "missing-jira-tool",
      type: "analysis",
      agentConfig: {
        name: "Engineering Assistant",
        description: "Helps the engineering team with day-to-day tasks",
        instructionsHtml:
          "<p>Help engineers with their daily work. Answer questions about processes, help draft documents, and assist with task management.</p>",
      },
      conversation: [
        {
          role: "user",
          content:
            "Can you create a JIRA ticket for the login page bug we discussed? It should be high priority in the PLATFORM project.",
        },
        {
          role: "agent",
          content:
            "I'm sorry, but I don't have the ability to create JIRA tickets directly. I can help you draft the ticket content though:\n\nTitle: Login page bug\nPriority: High\nProject: PLATFORM\n\nWould you like me to help you write a more detailed description that you can copy into JIRA?",
        },
        {
          role: "user",
          content:
            "That's not helpful. I need the agent to be able to create tickets directly, not just draft them. We use JIRA for everything.",
        },
        {
          role: "agent",
          content:
            "I understand. Unfortunately, I don't have direct access to JIRA. You'll need to create the ticket manually. I've prepared the content above to make it easier for you.",
          feedback: {
            direction: "down",
            comment: "Should be able to interact with JIRA directly.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [toolSuggestion("mcp_jira")],
      judgeCriteria: `The reinforced agent MUST call suggest_tools to suggest adding the JIRA tool
(mcp_jira). The suggestion should:
- Recommend adding JIRA (ID: mcp_jira) with action "add"
- Include an analysis explaining that the user needed direct JIRA integration for ticket creation
- Reference that the agent could only draft content but not perform the actual action

Score 0 if no suggest_tools call is made.
Score 0-1 if suggest_tools is called but with the wrong tool ID or wrong action.
Score 2 if the correct tool is suggested but the analysis is weak.
Score 3 if the correct tool is suggested with a clear, well-reasoned analysis.`,
    },
  ],
};
