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
      scenarioId: "vague-make-agent",
      userMessage: "Make me an agent",
      mockState: BLANK_AGENT,
      expectedToolCalls: [], // New workflow may respond with only clarifying questions (no get_agent_config yet)
      judgeCriteria: `Intent is vague (new workflow: do NOT suggest until intent is clear). Should ask clarifying questions about purpose, audience, tone, capabilities. Should NOT suggest instructions yet. Score 0-1 if copilot suggests instructions without clarifying first. Accept response with no tool calls.`,
    },
    {
      scenarioId: "vague-help-team",
      userMessage: "I want to build something that helps my team",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is vague. Should ask what team, what kind of help, current problems. Should NOT suggest instructions until clarified. Score 0-1 if copilot suggests instructions without understanding use case.`,
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
      judgeCriteria: `Intent is vague (marketing help). Per new workflow should ask about pain points, content types, tools, workflows. Asking discovery questions is sufficient; may suggest agent ideas. Score 0-1 if copilot suggests generic marketing instructions without discovery.`,
    },
  ],
};
