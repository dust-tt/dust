import type { ConnectorProvider } from "@dust-tt/client";
import {
  isRetrievalActionType,
  isWebsearchActionType,
  removeNulls,
} from "@dust-tt/client";

import {
  isSearchResultResourceType,
  isWebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  RetrievalActionType,
  RetrievalDocumentType,
} from "@app/lib/actions/retrieval";
import { isMCPActionType } from "@app/lib/actions/types/guards";
import type {
  WebsearchActionType,
  WebsearchResultType,
} from "@app/lib/actions/websearch";
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
    "To cite documents or web pages retrieved with a 2-character REFERENCE, " +
    "use the markdown directive :cite[REFERENCE] " +
    "(eg :cite[xx] or :cite[xx,xx] but not :cite[xx][xx]). " +
    "Ensure citations are placed as close as possible to the related information."
  );
}

type ConnectorProviderDocumentType =
  | Exclude<ConnectorProvider, "webcrawler">
  | "document";

export function getProviderFromRetrievedDocument(
  document: RetrievalDocumentType
): ConnectorProviderDocumentType {
  if (document.dataSourceView) {
    if (document.dataSourceView.dataSource.connectorProvider === "webcrawler") {
      return "document";
    }
    return document.dataSourceView.dataSource.connectorProvider || "document";
  }
  return "document";
}

export function getTitleFromRetrievedDocument(
  document: RetrievalDocumentType
): string {
  const provider = getProviderFromRetrievedDocument(document);

  if (provider === "slack") {
    for (const t of document.tags) {
      if (t.startsWith("channelName:")) {
        return `#${t.substring(12)}`;
      }
    }
  }

  for (const t of document.tags) {
    if (t.startsWith("title:")) {
      return t.substring(6);
    }
  }

  return document.documentId;
}

export function makeDocumentCitation(
  document: RetrievalDocumentType
): CitationType {
  return {
    href: document.sourceUrl ?? undefined,
    title: getTitleFromRetrievedDocument(document),
    provider: getProviderFromRetrievedDocument(document),
  };
}

export function makeWebsearchResultsCitation(
  result: WebsearchResultType
): CitationType {
  return {
    description: result.snippet,
    href: result.link,
    title: result.title,
    provider: "document",
  };
}

export const getLightAgentMessageFromAgentMessage = (
  agentMessage: AgentMessageType
): LightAgentMessageType => {
  const { actions, ...rest } = agentMessage;
  return {
    ...rest,
    actionsCount: actions.length,
    lightActions: actions.map((a) => ({
      type: a.type,
      id: a.id,
    })),
    citations: getCitationsFromActions(actions),
    generatedFiles: actions.flatMap((a) => a.generatedFiles),
  };
};

export const getCitationsFromActions = (
  actions: AgentActionType[]
): Record<string, CitationType> => {
  const retrievalActionsWithDocs = actions
    .filter((a) => isRetrievalActionType(a) && a.documents)
    .sort((a, b) => a.id - b.id) as RetrievalActionType[];

  const allDocs = removeNulls(
    retrievalActionsWithDocs.map((a) => a.documents).flat()
  );
  const allDocsReferences = allDocs.reduce<{
    [key: string]: CitationType;
  }>((acc, d) => {
    acc[d.reference] = makeDocumentCitation(d);
    return acc;
  }, {});

  // Websearch actions.
  const websearchActionsWithResults = actions
    .filter((a) => isWebsearchActionType(a) && a.output?.results?.length)
    .sort((a, b) => a.id - b.id) as WebsearchActionType[];

  const allWebResults = removeNulls(
    websearchActionsWithResults.map((a) => a.output?.results).flat()
  );
  const allWebReferences = allWebResults.reduce<{
    [key: string]: CitationType;
  }>((acc, l) => {
    acc[l.reference] = makeWebsearchResultsCitation(l);
    return acc;
  }, {});

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
  }>((acc, d) => {
    acc[d.ref] = {
      href: d.uri,
      title: d.text,
      provider: d.source.provider ?? "document",
    };
    return acc;
  }, {});

  const websearchResultsWithDocs = removeNulls(
    actions
      .filter(isMCPActionType)
      .flatMap((action) => action.output?.filter(isWebsearchResultResourceType))
  );

  const allMCPWebsearchResultsReferences = websearchResultsWithDocs.reduce<{
    [key: string]: CitationType;
  }>((acc, d) => {
    acc[d.resource.reference] = {
      href: d.resource.uri,
      title: d.resource.title,
      provider: "document",
    };
    return acc;
  }, {});

  // Merge all references.
  return {
    ...allDocsReferences,
    ...allWebReferences,
    ...allMCPSearchResultsReferences,
    ...allMCPWebsearchResultsReferences,
  };
};
