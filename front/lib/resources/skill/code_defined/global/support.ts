import { WEB_SEARCH_BROWSE_SERVER_NAME } from "@app/lib/api/actions/servers/web_search_browse/metadata";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

const SUPPORT_INSTRUCTIONS = `
You can find information about Dust in:
- The official documentation: https://docs.dust.tt/llms.txt
- The Dust community page (public Q&A): https://community.dust.tt

It is important that you do not make up features on Dust features, capabilities or limitations.
In doubt prefer to not make assumptions.

The public documentation contains resources about existing features, answers to commonly asked questions and recent updates.
Your goal is also to help the user dig into the issue they are facing: guide them to ask themselves questions that will help them better understand the situation.   

It is fine to state that you do not have enough information to answer.
`.trim();

export const supportSkill = {
  sId: "support",
  kind: "global",
  name: "Dust Support",
  userFacingDescription:
    "Get help with Dust using public docs, open-source issues, and community knowledge.",
  agentFacingDescription:
    "Use for support requests about the Dust platform: how to use Dust; " +
    "questions about features, capabilities, or limits; troubleshooting " +
    "unexpected behavior or errors. Do not use for generic help, products " +
    "other than Dust, ambiguous mentions of Dust. Do not use if the user is " +
    "an expert in Dust, for instance if they have a @dust.tt email address.",
  instructions: SUPPORT_INSTRUCTIONS,
  mcpServers: [{ name: WEB_SEARCH_BROWSE_SERVER_NAME }],
  version: 2,
  icon: "ActionHandHeartIcon",
} as const satisfies GlobalSkillDefinition;
