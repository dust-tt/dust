import { removeNulls } from "@dust-tt/client";

import {
  isSearchResultResourceType,
  isWebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isMCPActionType } from "@app/lib/actions/types/guards";
import { rand } from "@app/lib/utils/seeded_random";
import type {
  AgentActionType,
  AgentMessageType,
  CitationType,
  LightAgentMessageType,
} from "@app/types";

let REFS: string[] | null = null;
const getRand = rand("chawarma");

export const getRefs = () => {
  if (REFS === null) {
    REFS = "abcdefghijklmnopqrstuvwxyz0123456789"
      .split("")
      .map((c) => {
        return "abcdefghijklmnopqrstuvwxyz0123456789".split("").map((n) => {
          return `${c}${n}`;
        });
      })
      .flat();
    // randomize
    REFS.sort(() => {
      const r = getRand();
      return r > 0.5 ? 1 : -1;
    });
  }
  return REFS;
};

/**
 * Prompt to remind agents how to cite documents or web pages.
 */
export function citationMetaPrompt() {
  return (
    "## CITING DOCUMENTS\n" +
    "To cite documents or web pages retrieved with a 2-character REFERENCE, " +
    "use the markdown directive :cite[REFERENCE] " +
    "(eg :cite[xx] or :cite[xx,xx] but not :cite[xx][xx]). " +
    "Ensure citations are placed as close as possible to the related information."
  );
}

export const getCitationsFromActions = (
  actions: AgentActionType[]
): Record<string, CitationType> => {
  // MCP actions with search results.
  const searchResultsWithDocs = removeNulls(
    actions
      .filter(isMCPActionType)
      .flatMap((action) =>
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
    actions
      .filter(isMCPActionType)
      .flatMap((action) => action.output?.filter(isWebsearchResultResourceType))
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
