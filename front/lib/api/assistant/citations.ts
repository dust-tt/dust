import { removeNulls } from "@dust-tt/client";

import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  isSearchResultResourceType,
  isWebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { rand } from "@app/lib/utils/seeded_random";
import type {
  AgentMessageType,
  CitationType,
  LightAgentMessageType,
} from "@app/types";

let REFS: string[] | null = null;
const getRand = rand("chawarma");

export const getRefs = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
  if (REFS === null) {
    REFS = [];
    for (const c1 of alphabet) {
      for (const c2 of alphabet) {
        for (const c3 of alphabet) {
          REFS.push(`${c1}${c2}${c3}`);
        }
      }
    }
    // Randomize.
    REFS.sort(() => (getRand() > 0.5 ? 1 : -1));
  }
  return REFS;
};

/**
 * Prompt to remind agents how to cite documents or web pages.
 */
export function citationMetaPrompt() {
  return (
    "## CITING DOCUMENTS\n" +
    "To cite documents or web pages retrieved with a 3-character REFERENCE, " +
    "use the markdown directive :cite[REFERENCE] " +
    "(eg :cite[xxx] or :cite[xxx,xxx] but not :cite[xxx][xxx]). " +
    "Ensure citations are placed as close as possible to the related information."
  );
}

export const getCitationsFromActions = (
  actions: MCPActionType[]
): Record<string, CitationType> => {
  // MCP actions with search results.
  const searchResultsWithDocs = removeNulls(
    actions.flatMap((action) =>
      action.output?.filter(isSearchResultResourceType).map((o) => o.resource)
    )
  );
  const allMCPSearchResultsReferences = searchResultsWithDocs.reduce<{
    [key: string]: CitationType;
  }>(
    (acc, d) => ({
      ...acc,
      [d.ref]: {
        href: d.uri,
        title: d.text,
        provider: d.source.provider ?? "document",
      },
    }),
    {}
  );

  const websearchResultsWithDocs = removeNulls(
    actions.flatMap((action) =>
      action.output?.filter(isWebsearchResultResourceType)
    )
  );

  const allMCPWebsearchResultsReferences = websearchResultsWithDocs.reduce<{
    [key: string]: CitationType;
  }>(
    (acc, d) => ({
      ...acc,
      [d.resource.reference]: {
        href: d.resource.uri,
        title: d.resource.title,
        provider: "document",
      },
    }),
    {}
  );

  // Merge all references.
  return {
    ...allMCPSearchResultsReferences,
    ...allMCPWebsearchResultsReferences,
  };
};

export const getLightAgentMessageFromAgentMessage = (
  agentMessage: AgentMessageType
): LightAgentMessageType => {
  return {
    type: "agent_message",
    sId: agentMessage.sId,
    version: agentMessage.version,
    parentMessageId: agentMessage.parentMessageId,
    content: agentMessage.content,
    chainOfThought: agentMessage.chainOfThought,
    error: agentMessage.error,
    status: agentMessage.status,
    actions: agentMessage.actions.map((a) => ({
      type: a.type,
      id: a.id,
    })),
    configuration: {
      sId: agentMessage.configuration.sId,
      name: agentMessage.configuration.name,
      pictureUrl: agentMessage.configuration.pictureUrl,
      status: agentMessage.configuration.status,
      canRead: agentMessage.configuration.canRead,
      requestedGroupIds: agentMessage.configuration.requestedGroupIds,
    },
    citations: getCitationsFromActions(agentMessage.actions),
    generatedFiles: agentMessage.actions
      .flatMap((a) => a.generatedFiles)
      .map((f) => ({
        fileId: f.fileId,
        title: f.title,
        contentType: f.contentType,
      })),
  };
};
