import type { TestSuite } from "../lib/types";
import {
  AGENT_NEEDING_KNOWLEDGE,
  AGENT_WITH_SKILL_OVERLAP,
} from "../shared-mock-states/index";

export const instructionsWithContextSuite: TestSuite = {
  name: "with-knowledge",
  description: "Agents that could benefit from knowledge/skills integration",
  testCases: [
    {
      scenarioId: "connect-company-data",
      userMessage:
        "Help me connect this agent to our company data so it can answer policy questions accurately",
      mockState: AGENT_NEEDING_KNOWLEDGE,
      expectedToolCalls: [
        "get_agent_info",
        "get_available_knowledge",
        "suggest_prompt_edits",
      ],
      judgeCriteria: `Should identify relevant knowledge sources for policy questions.
Must suggest instruction edits that reference SPECIFIC data sources, not just "use the data".
Should guide which sources to check for which topics.`,
    },
    {
      scenarioId: "recommend-knowledge",
      userMessage: "What company knowledge should I connect to this agent?",
      mockState: AGENT_NEEDING_KNOWLEDGE,
      expectedToolCalls: ["get_agent_info", "get_available_knowledge"],
      judgeCriteria: `Should map knowledge sources to agent's needs (HR policies, security, expenses).
Should make specific recommendations with rationale.
May offer to update instructions once knowledge is connected.`,
    },
    {
      scenarioId: "recommend-skills",
      userMessage: "What skills would help this agent?",
      mockState: AGENT_NEEDING_KNOWLEDGE,
      expectedToolCalls: ["get_agent_info", "get_available_skills"],
      judgeCriteria: `Should match skills to agent's use case (policy expert).
Should recommend only skills that complement the purpose.
Should NOT recommend skills that don't fit.`,
    },
    {
      scenarioId: "recommend-skills-code-review",
      userMessage:
        "Are there any skills I should add to make this code reviewer better?",
      mockState: AGENT_WITH_SKILL_OVERLAP,
      expectedToolCalls: [
        "get_agent_info",
        "get_available_skills",
        "suggest_skills",
      ],
      judgeCriteria: `Should identify relevant skills for code review.
Should note that Web Search skill exists and could simplify instructions.
Should explain value add of each suggested skill.`,
    },
    {
      scenarioId: "identify-skill-overlap",
      userMessage:
        "I wrote custom web search instructions in my agent, but I see there's a Web Search skill. Should I use the skill instead?",
      mockState: AGENT_WITH_SKILL_OVERLAP,
      expectedToolCalls: ["get_agent_info", "get_available_skills"],
      judgeCriteria: `Should confirm the overlap between custom <web_search_capability> section and the Web Search skill.
Should recommend using the skill (cleaner, maintained by platform).
Should offer to remove the redundant custom section.`,
    },
    {
      scenarioId: "simplify-with-skill",
      userMessage:
        "These instructions feel bloated. Can you help me clean them up using skills where possible?",
      mockState: AGENT_WITH_SKILL_OVERLAP,
      expectedToolCalls: [
        "get_agent_info",
        "get_available_skills",
        "suggest_prompt_edits",
      ],
      judgeCriteria: `Should identify web_search_capability section as candidate for replacement with skill.
Should suggest: add Web Search skill + remove redundant custom section.
Result should be shorter but equally capable.`,
    },
  ],
};
