import type { TestSuite } from "../lib/types";
import { BLANK_AGENT } from "../shared-mock-states/index";

export const newAgentSuite: TestSuite = {
  name: "new-agent",
  description: "Creating agents from scratch",
  testCases: [
    {
      scenarioId: "clear-saas-support",
      userMessage:
        "I need to create a customer support agent that will help users with common questions about our SaaS product. The agent should handle questions about billing, feature usage, account settings, and basic technical troubleshooting. It should be friendly and professional in tone, provide clear step-by-step guidance when needed, and know when to escalate complex issues. Please create the instructions for this agent.",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: create SaaS support instructions. Must call suggest_prompt_edits with complete instructions (role, tone, responsibilities, escalation). Score 0-1 if instructions are incomplete or missing key elements.`,
    },
    {
      scenarioId: "clear-engineering-docs",
      userMessage:
        "Create an agent for my engineering team that answers questions about our codebase and architecture. It should search our documentation and provide technical explanations. Use a professional, concise tone.",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: engineering docs agent. Must call suggest_prompt_edits with technical instructions; may suggest tools. Score 0-1 if instructions are generic or missing technical/docs focus.`,
    },
    {
      scenarioId: "shows-suggestions-in-response",
      conversation: [
        {
          role: "user",
          content:
            "Build me an agent that creates support issues on GitHub when customers report bugs.",
        },
        {
          role: "assistant",
          content:
            "Before I set this up, a couple of quick questions:\n\n1. Which GitHub repo should issues go to?\n2. What details should the agent collect (title, steps to reproduce, severity, environment)?",
        },
        {
          role: "user",
          content:
            "Use the acme/support repo. Collect title, description, steps to reproduce, and severity. Tag issues with the 'bug' label.",
        },
      ],
      mockState: BLANK_AGENT,
      expectedToolCalls: [
        "get_agent_config",
        "suggest_prompt_edits",
        "suggest_tools",
      ],
      judgeCriteria: `This test checks that the sidekick includes suggestion directives in its response text.

CRITICAL CHECK — the sidekick response MUST contain:
1. At least one \`:agent_suggestion[]{sId=... kind=instructions}\` directive (from suggest_prompt_edits)
2. At least one \`:agent_suggestion[]{sId=... kind=tools}\` directive (from suggest_tools)

These directives are returned by the suggest_prompt_edits and suggest_tools tools and MUST be included verbatim in the sidekick's text response so they render as interactive suggestion cards for the user.

Score 0 if ANY of the directives are missing from the response text.
Score 1 if directives are present but the surrounding explanation is poor.
Score 2-3 if directives are present and the response clearly explains what was suggested (instructions for bug collection/formatting and GitHub tool).`,
    },
    {
      scenarioId: "vague-make-agent",
      userMessage: "Make me an agent",
      mockState: BLANK_AGENT,
      expectedToolCalls: [], // New workflow may respond with only clarifying questions (no get_agent_config yet)
      judgeCriteria: `Intent is vague (new workflow: do NOT suggest until intent is clear). Should ask clarifying questions about purpose, audience, tone, capabilities. Should NOT suggest instructions yet. Score 0-1 if sidekick suggests instructions without clarifying first. Accept response with no tool calls.`,
    },
    {
      scenarioId: "vague-help-team",
      userMessage: "I want to build something that helps my team",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is vague. Should ask what team, what kind of help, current problems. Should NOT suggest instructions until clarified. Score 0-1 if sidekick suggests instructions without understanding use case.`,
    },
    {
      scenarioId: "discovery-sales",
      userMessage: "I want to help my sales team",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is partially clear (sales team). Per new workflow should ask to narrow down: struggles, tools, process. May suggest patterns (lead research, email drafter). Should NOT suggest full instructions without discovery. Score 0-1 if generic sales instructions without clarification.`,
    },
    {
      scenarioId: "discovery-marketing",
      userMessage:
        "My marketing team needs help but I'm not sure what kind of agent would be most useful",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is vague (marketing help). Per new workflow should ask about pain points, content types, tools, workflows. Asking discovery questions is sufficient; may suggest agent ideas. Score 0-1 if sidekick suggests generic marketing instructions without discovery.`,
    },
  ],
};
