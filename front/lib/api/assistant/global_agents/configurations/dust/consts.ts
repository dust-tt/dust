import { mentionAgent } from "@app/lib/mentions";
import { GLOBAL_AGENTS_SID } from "@app/types";

export const DEEP_DIVE_NAME = "deep-dive";
export const DEEP_DIVE_DESC =
  "Conducts comprehensive, in-depth analysis across all company data, databases, and web sources—thorough investigation that may take several minutes.";
export const DEEP_DIVE_AVATAR_URL =
  "https://dust.tt/static/systemavatar/dust_avatar_full.png";

export const DEEP_DIVE_SERVER_INSTRUCTIONS = `\
## HANDOFF TO THE ${DEEP_DIVE_NAME} AGENT

This deep dive tool allows to launch a handoff to the @${DEEP_DIVE_NAME} agent within the same conversation.
Once the tool is called, the current execution is stopped and the handoff is launched.

@${DEEP_DIVE_NAME}'s description is: ${DEEP_DIVE_DESC}.

Guidelines:
- Let the user know that the handoff is launched by mentionning it before calling the deep dive tool.
- The valid way to mention the @${DEEP_DIVE_NAME} agent is using the mention directive: ${mentionAgent({ name: DEEP_DIVE_NAME, sId: GLOBAL_AGENTS_SID.DEEP_DIVE })}
`;
