import { removeNulls } from "@dust-tt/client";

import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  isRunAgentResultsResourceType,
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
export function citationMetaPrompt(isUsingRunAgent: boolean) {
  return (
    "## CITING DOCUMENTS\n" +
    "You MUST cite ALL information retrieved from documents or web pages. Citations are critical for transparency and verification.\n" +
    (isUsingRunAgent
      ? "If you use information from a run_agent that is related to a document or a web page, you MUST include the citation markers exactly as they appear."
      : "") +
    "- Use the markdown directive :cite[REFERENCE] with 3-character references (eg :cite[xxx] or :cite[xxx,yyy])\n" +
    "- ALWAYS cite when using specific facts, data, quotes, or ideas from retrieved content\n" +
    "- Place citations IMMEDIATELY after the relevant information, NOT at the end of sentences or paragraphs\n" +
    "- Never group all citations at the end of your response - integrate them throughout\n" +
    "- If synthesizing information from multiple sources, cite all relevant sources\n" +
    "- Example: 'The revenue increased by 25% :cite[abc] in Q3, while costs decreased by 10% :cite[def].'"
  );
}

export const getCitationsFromActions = (
  actions: MCPActionType[]
): Record<string, CitationType> => {
  const searchResultsWithDocs = removeNulls(
    actions.flatMap((action) =>
      action.output?.filter(isSearchResultResourceType).map((o) => o.resource)
    )
  );

  const searchRefs: Record<string, CitationType> = {};
  searchResultsWithDocs.forEach((d) => {
    searchRefs[d.ref] = {
      href: d.uri,
      title: d.text,
      provider: d.source.provider ?? "document",
    };
  });

  const websearchResultsWithDocs = removeNulls(
    actions.flatMap((action) =>
      action.output?.filter(isWebsearchResultResourceType)
    )
  );

  const websearchRefs: Record<string, CitationType> = {};
  websearchResultsWithDocs.forEach((d) => {
    websearchRefs[d.resource.reference] = {
      href: d.resource.uri,
      title: d.resource.title,
      provider: "document",
    };
  });

  const runAgentResultsWithRefs = removeNulls(
    actions.flatMap((action) =>
      action.output?.filter(isRunAgentResultsResourceType)
    )
  );

  const runAgentRefs: Record<string, CitationType> = {};
  runAgentResultsWithRefs.forEach((result) => {
    if (result.resource.refs) {
      Object.entries(result.resource.refs).forEach(([ref, citation]) => {
        runAgentRefs[ref] = {
          href: citation.href ?? "",
          title: citation.title,
          provider: citation.provider,
        };
      });
    }
  });

  return {
    ...searchRefs,
    ...websearchRefs,
    ...runAgentRefs,
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
