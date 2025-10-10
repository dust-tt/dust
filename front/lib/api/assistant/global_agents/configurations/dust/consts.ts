import { GLOBAL_AGENTS_SID } from "@app/types";

export const DEEP_DIVE_NAME = "deep-dive";
export const DEEP_DIVE_DESC =
  "Deep dive within the full company data and data warehouses, web search/browse.";

export const DEEP_DIVE_SERVER_INSTRUCTIONS = `\
## HANDOFF TO THE ${DEEP_DIVE_NAME} AGENT

This deep dive tool allows to launch a handoff to the @${DEEP_DIVE_NAME} agent within the same conversation.
Once the tool is called, the current execution is stopped and the handoff is launched.

@${DEEP_DIVE_NAME}'s description is: ${DEEP_DIVE_DESC}.

Guidelines:
- Before calling the deep dive tool, make sure to let the user know that the handoff is launched by mentionning it.
- Make sure to use the mention directive to mention the @${DEEP_DIVE_NAME} agent: :mention[${DEEP_DIVE_NAME}]{sId=${GLOBAL_AGENTS_SID.DEEP_DIVE}}
`;
