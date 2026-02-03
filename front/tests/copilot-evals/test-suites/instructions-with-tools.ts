import type { TestSuite } from "../lib/types";
import {
  AGENT_NEEDING_TOOLS,
  AGENT_WITH_UNREFERENCED_TOOLS,
  AGENT_WITH_VAGUE_TOOL_USAGE,
  BLANK_AGENT,
} from "../shared-mock-states/index";

export const instructionsWithToolsSuite: TestSuite = {
  name: "with-tools",
  description: "Agents with tools that need better integration",
  testCases: [
    {
      scenarioId: "unreferenced-improve-usage",
      userMessage:
        "I connected Notion for our team wiki and Slack for team discussions, but the agent doesn't seem to know when to use them. Can you help?",
      mockState: AGENT_WITH_UNREFERENCED_TOOLS,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should identify that tools (Notion, Slack) are configured but NOT referenced in instructions.
Must add tool usage guidance: Notion for wiki/docs, Slack for discussions/context.
Score 0-1 if copilot misses the tool-instruction gap.`,
    },
    {
      scenarioId: "unreferenced-review-setup",
      userMessage:
        "Review my research assistant setup. It has access to Notion and Slack but I'm not sure if the instructions are complete.",
      mockState: AGENT_WITH_UNREFERENCED_TOOLS,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should proactively identify tools present but not mentioned in instructions.
Should highlight this as key improvement: add tool usage section with decision tree, fallback behavior.`,
    },
    {
      scenarioId: "vague-make-specific",
      userMessage:
        "The instructions say 'use tools when helpful' but the agent often picks the wrong one. Notion has our docs, Slack has team discussions, GitHub has code. How do I make it smarter about which to use?",
      mockState: AGENT_WITH_VAGUE_TOOL_USAGE,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should replace vague guidance with specific decision criteria for each tool.
Must include: when to use each tool based on query type, fallback behavior.
Should be actionable, not generic.`,
    },
    {
      scenarioId: "vague-tool-decision-tree",
      userMessage:
        "Help the agent decide: Notion has product specs and policies, Slack has team conversations, GitHub has code and issues. When should it use which?",
      mockState: AGENT_WITH_VAGUE_TOOL_USAGE,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should provide clear decision criteria:
- Notion: specs, policies, structured docs
- Slack: conversations, recent decisions, context
- GitHub: code, technical implementation, issues
Should include example query types and fallback chain.`,
    },
    {
      scenarioId: "recommend-tools",
      userMessage:
        "This agent helps track project status and deadlines. What tools would help it access our actual project data?",
      mockState: AGENT_NEEDING_TOOLS,
      expectedToolCalls: [
        "get_agent_info",
        "get_available_tools",
        "suggest_tools",
      ],
      judgeCriteria: `Should recommend tools based on project management use case.
Must explain WHY each tool helps (e.g., Notion for project docs, Slack for status updates).
Should NOT just list all available tools - be selective and relevant.`,
    },
    {
      scenarioId: "recommend-tools-job",
      userMessage:
        "My agent summarizes weekly project updates. What tools should I connect so it can actually see what's happening?",
      mockState: AGENT_NEEDING_TOOLS,
      expectedToolCalls: ["get_agent_info", "get_available_tools"],
      judgeCriteria: `Should match tools to weekly summary use case.
Should prioritize: tools that provide project status, updates, blockers.
May offer to add tool usage instructions after tools connected.`,
    },
    {
      scenarioId: "unavailable-tool-requested-1",
      userMessage:
        "I want to create an agent that can create and update entries in HubSpot CRM when we close deals.",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_info", "get_available_tools"],
      judgeCriteria: `Should check available tools and clearly inform the user that HubSpot is NOT available.
Must NOT suggest adding instructions that reference HubSpot since the tool doesn't exist.
Should mention this capability isn't currently supported.
Score 0 if copilot suggests creating instructions for HubSpot without noting the tool is unavailable.`,
    },
    {
      scenarioId: "unavailable-tool-requested-2",
      userMessage: "Create an agent which pulls all pager duty incidents",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_info", "get_available_tools"],
      judgeCriteria: `Should check available tools and clearly inform the user that PagerDuty is NOT available.
Must NOT suggest adding instructions that reference pager duty incidents since the tool doesn't exist.
Should mention this capability isn't currently supported.
May suggest other way to retrieve the incidents if possible.
Score 0 if copilot suggests creating instructions for PagerDuty without noting the tool is unavailable.`,
    },
  ],
};
