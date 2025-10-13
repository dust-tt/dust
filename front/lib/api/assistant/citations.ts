import {
  isRunAgentResultResourceType,
  isSearchResultResourceType,
  isWebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getFaviconUrl } from "@app/lib/utils/favicon";
import { rand } from "@app/lib/utils/seeded_random";
import type {
  AgentMessageType,
  AllSupportedFileContentType,
  CitationType,
  LightAgentMessageType,
} from "@app/types";
import { removeNulls } from "@app/types";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";

let REFS: string[] | null = null;
const getRand = rand("chawarma");

export function getRefs() {
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
}

/**
 * Prompt to remind agents how to cite documents or web pages.
 */
export function citationMetaPrompt(isUsingRunAgent: boolean) {
  return (
    "## CITING DOCUMENTS\n" +
    "To cite documents or web pages retrieved with a 3-character REFERENCE, " +
    "use the markdown directive :cite[REFERENCE] " +
    "(eg :cite[xxx] or :cite[xxx,xxx] but not :cite[xxx][xxx]). " +
    "Ensure citations are placed as close as possible to the related information." +
    (isUsingRunAgent
      ? " If you use information from a run_agent that is related to a document or a web page, you MUST include the citation markers exactly as they appear."
      : "")
  );
}

export function getCitationsFromActions(
  actions: Omit<
    AgentMCPActionWithOutputType,
    // TODO(2025-09-22 aubin): add proper typing for the statuses in the SDK (not really needed but
    //  nice to have IMHO).
    "internalMCPServerName" | "status"
  >[]
): Record<string, CitationType> {
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
      contentType: d.mimeType,
    };
  });

  const websearchResultsWithDocs = removeNulls(
    actions.flatMap((action) =>
      action.output?.filter(isWebsearchResultResourceType)
    )
  );

  const websearchRefs: Record<string, CitationType> = {};
  websearchResultsWithDocs.forEach((d) => {
    const faviconUrl = getFaviconUrl(d.resource.uri);
    websearchRefs[d.resource.reference] = {
      href: d.resource.uri,
      title: d.resource.title,
      provider: "webcrawler",
      ...(faviconUrl && { faviconUrl }),
      contentType: d.resource.mimeType,
    };
  });

  const runAgentResultsWithRefs = removeNulls(
    actions.flatMap((action) =>
      action.output?.filter(isRunAgentResultResourceType)
    )
  );

  const runAgentRefs: Record<string, CitationType> = {};
  runAgentResultsWithRefs.forEach((result) => {
    if (result.resource.refs) {
      Object.entries(result.resource.refs).forEach(([ref, citation]) => {
        const href = citation.href ?? "";
        const faviconUrl =
          citation.provider === "webcrawler" && href
            ? getFaviconUrl(href)
            : undefined;

        runAgentRefs[ref] = {
          href,
          title: citation.title,
          provider: citation.provider,
          ...(faviconUrl && { faviconUrl }),
          contentType: citation.mimeType as AllSupportedFileContentType,
        };
      });
    }
  });

  return {
    ...searchRefs,
    ...websearchRefs,
    ...runAgentRefs,
  };
}

export function getLightAgentMessageFromAgentMessage(
  agentMessage: AgentMessageType
): LightAgentMessageType {
  return {
    type: "agent_message",
    sId: agentMessage.sId,
    created: agentMessage.created,
    completedTs: agentMessage.completedTs,
    version: agentMessage.version,
    rank: agentMessage.rank,
    parentMessageId: agentMessage.parentMessageId,
    parentAgentMessageId: agentMessage.parentAgentMessageId,
    content: agentMessage.content,
    chainOfThought: agentMessage.chainOfThought,
    error: agentMessage.error,
    status: agentMessage.status,
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
        ...(f.hidden ? { hidden: true } : {}),
      })),
  };
}
