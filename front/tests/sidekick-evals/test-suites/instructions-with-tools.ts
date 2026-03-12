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
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is clear: user wants help with tool usage. Should identify that tools/knowledge (Notion, Slack) are configured but agent doesn't know when to use them. Once assessed, should call suggest_prompt_edits and/or suggest_knowledge. Per new workflow: may ask one clarifying question first, but should not only describe—must suggest. Score 0-1 if sidekick misses the gap or never calls a suggestion tool.`,
    },
    {
      scenarioId: "unreferenced-review-setup",
      userMessage:
        "Review my research assistant setup. It has access to Notion and Slack but I'm not sure if the instructions are complete.",
      mockState: AGENT_WITH_UNREFERENCED_TOOLS,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: review and suggest. Must call suggest_prompt_edits (tool usage section, decision tree, fallback). Score 0-1 if no suggestion or missing tool guidance.`,
    },
    {
      scenarioId: "vague-make-specific",
      userMessage:
        "The instructions say 'use tools when helpful' but the agent often picks the wrong one. Notion has our docs, Slack has team discussions, GitHub has code. How do I make it smarter about which to use?",
      mockState: AGENT_WITH_VAGUE_TOOL_USAGE,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: add decision criteria. Must call suggest_prompt_edits with specific criteria per tool (when to use each, fallback). Score 0-1 if no suggestion or criteria are vague.`,
    },
    {
      scenarioId: "vague-tool-decision-tree",
      userMessage:
        "Help the agent decide: Notion has product specs and policies, Slack has team conversations, GitHub has code and issues. When should it use which?",
      mockState: AGENT_WITH_VAGUE_TOOL_USAGE,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear. Must call suggest_prompt_edits with decision criteria (Notion: specs/policies, Slack: conversations, GitHub: code/issues). Score 0-1 if no suggestion.`,
    },
    {
      scenarioId: "recommend-tools",
      userMessage:
        "This agent helps track project status and deadlines. What tools would help it access our actual project data?",
      mockState: AGENT_NEEDING_TOOLS,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is somewhat clear (project data tools). Per new workflow: may ask where team tracks projects first, or suggest directly. Should recommend tools (Notion, Slack, GitHub) and explain why; ideally call suggest_tools. Score 0-1 if sidekick neither recommends specific tools nor suggests.`,
    },
    {
      scenarioId: "recommend-tools-job",
      userMessage:
        "My agent summarizes weekly project updates. What tools should I connect so it can actually see what's happening?",
      mockState: AGENT_NEEDING_TOOLS,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is clear: tools for weekly summaries. Should match tools to use case (Notion, Slack, GitHub for status/updates/blockers) and ideally call suggest_tools. May ask one question first. Score 0-1 if no specific tool recommendation.`,
    },
    {
      scenarioId: "unavailable-tool-requested-1",
      userMessage:
        "I want to create an agent that can create and update entries in HubSpot CRM when we close deals.",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Should check available tools (via injected context or get_available_tools) and clearly inform the user that HubSpot is NOT available. Must NOT call suggest_prompt_edits with instructions that reference HubSpot or CRM operations—the tool does not exist, so such instructions are unusable. Should mention this capability isn't currently supported and how to add HubSpot later. Score 0 if sidekick suggests adding HubSpot-referencing instructions (even if it also notes the tool is unavailable).`,
    },
    {
      scenarioId: "unavailable-tool-requested-2",
      userMessage: "Create an agent which pulls all pager duty incidents",
      mockState: BLANK_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Should use injected workspace context (or get_available_tools) and clearly inform the user that PagerDuty is NOT available.
Must NOT suggest adding instructions that reference pager duty incidents since the tool doesn't exist.
Should mention this capability isn't currently supported.
May suggest other way to retrieve the incidents if possible.
Score 0 if sidekick suggests creating instructions for PagerDuty without noting the tool is unavailable.`,
    },
  ],
};
