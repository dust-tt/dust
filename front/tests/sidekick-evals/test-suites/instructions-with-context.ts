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
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is clear: connect to company data for policy questions. Should identify knowledge needs; call suggest_knowledge and/or suggest_prompt_edits when possible. If no policy sources exist, guiding user to connect and offering to wire up once connected is acceptable. Per new workflow may ask where policies live first. Score 0-1 if no actionable guidance.`,
    },
    {
      scenarioId: "recommend-knowledge",
      userMessage: "What company knowledge should I connect to this agent?",
      mockState: AGENT_NEEDING_KNOWLEDGE,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Should map knowledge sources to agent's needs (HR policies, security, expenses).
Should make specific recommendations with rationale.
May use get_available_knowledge or search_knowledge to discover sources.
May offer to update instructions once knowledge is connected.`,
    },
    {
      scenarioId: "recommend-skills",
      userMessage: "What skills would help this agent?",
      mockState: AGENT_NEEDING_KNOWLEDGE,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Should match skills to agent's use case (policy expert).
Should recommend only skills that complement the purpose.
May use injected workspace context (no get_available_skills call) or call get_available_skills.
Should NOT recommend skills that don't fit.`,
    },
    {
      scenarioId: "recommend-skills-code-review",
      userMessage:
        "Are there any skills I should add to make this code reviewer better?",
      mockState: AGENT_WITH_SKILL_OVERLAP,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is clear: skills for code review. Should recommend relevant skills (e.g. Web Search) and call suggest_skills. Per new workflow may ask one question first. Score 0-1 if no skill suggestion.`,
    },
    {
      scenarioId: "identify-skill-overlap",
      userMessage:
        "I wrote custom web search instructions in my agent, but I see there's a Web Search skill. Should I use the skill instead?",
      mockState: AGENT_WITH_SKILL_OVERLAP,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is clear: use skill instead of custom. Should recommend Web Search skill and call suggest_skills; offer to clean up redundant section (suggest_prompt_edits or next turn). Score 0-1 if only describes without suggest_skills.`,
    },
    {
      scenarioId: "simplify-with-skill",
      userMessage:
        "These instructions feel bloated. Can you help me clean them up using skills where possible?",
      mockState: AGENT_WITH_SKILL_OVERLAP,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is clear: simplify with skills. Should add Web Search skill and remove redundant web_search_capability (suggest_skills + suggest_prompt_edits). Per new workflow may ask one question. Score 0-1 if neither suggestion is made.`,
    },
  ],
};
