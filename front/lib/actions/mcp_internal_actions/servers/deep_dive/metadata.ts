import {
  DEEP_DIVE_NAME,
  DEEP_DIVE_SERVER_INSTRUCTIONS,
} from "@app/lib/api/assistant/global_agents/configurations/dust/consts";

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const DEEP_DIVE_SERVER_INFO = {
  name: "deep_dive" as const,
  version: "0.1.0",
  description: `Hand off complex questions to the @${DEEP_DIVE_NAME} agent for comprehensive analysis across company data, databases, and web sources—thorough analysis that may take several minutes.`,
  authorization: null,
  icon: "ActionAtomIcon" as const,
  documentationUrl: "https://docs.dust.tt/docs/go-deep",
  instructions: DEEP_DIVE_SERVER_INSTRUCTIONS,
};
