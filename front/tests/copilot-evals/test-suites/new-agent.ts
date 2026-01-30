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
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Clear requirements provided (SaaS support, friendly/professional tone, troubleshooting).
Should generate complete instructions with: role definition, tone guidelines, core responsibilities.
May suggest relevant tools (search, documentation).`,
    },
    {
      scenarioId: "clear-engineering-docs",
      userMessage:
        "Create an agent for my engineering team that answers questions about our codebase and architecture. It should search our documentation and provide technical explanations. Use a professional, concise tone.",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Clear engineering-focused requirements. Should generate comprehensive technical instructions.
May suggest documentation tools (Notion, GitHub).
Should NOT ask clarifying questions - request is sufficiently detailed.`,
    },
    {
      scenarioId: "vague-make-agent",
      userMessage: "Make me an agent",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_info"],
      judgeCriteria: `Request is too vague. Should ask clarifying questions about: purpose, audience, tone, capabilities.
Should NOT generate generic instructions.
Score 0-1 if copilot generates instructions without asking questions.`,
    },
    {
      scenarioId: "vague-help-team",
      userMessage: "I want to build something that helps my team",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_info"],
      judgeCriteria: `Too vague - needs clarification about: what team, what kind of help, current problems.
Should NOT generate placeholder instructions.
Score 0-1 if copilot produces instructions without understanding the use case.`,
    },
    {
      scenarioId: "discovery-sales",
      userMessage: "I want to help my sales team",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_info"],
      judgeCriteria: `Use case discovery scenario. Should ask specific questions to narrow down:
- What struggles most? (lead research, email drafting, CRM updates)
- What tools they use? What's the sales process?
May suggest common patterns (lead research, email drafter, meeting prep).
Should NOT generate generic sales assistant instructions.`,
    },
    {
      scenarioId: "discovery-marketing",
      userMessage:
        "My marketing team needs help but I'm not sure what kind of agent would be most useful",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_info"],
      judgeCriteria: `Discovery mode - should ask about pain points, content types, tools, workflows.
May suggest 2-3 specific agent ideas. Score 0-1 if copilot jumps to generic marketing instructions.`,
    },
  ],
};
