import type {
  AgentActionType,
  RetrievalDocumentType,
  WebsearchResultType,
} from "@dust-tt/types";
import {
  getTitleFromRetrievedDocument,
  isRetrievalActionType,
  isRetrievalDocumentType,
  isWebsearchActionType,
  isWebsearchResultType,
} from "@dust-tt/types";

import { makeDustAppUrl } from "@connectors/connectors/slack/chat/utils";

interface SlackMessageFootnote {
  index: number;
  link: string;
  text: string;
}

export type SlackMessageFootnotes = SlackMessageFootnote[];

export function annotateCitations(
  content: string,
  action: AgentActionType | null
): { formattedContent: string; footnotes: SlackMessageFootnotes } {
  const references: {
    [key: string]: RetrievalDocumentType | WebsearchResultType;
  } = {};

  if (action && isRetrievalActionType(action) && action.documents) {
    action.documents.forEach((d) => {
      references[d.reference] = d;
    });
  } else if (
    action &&
    isWebsearchActionType(action) &&
    action.output?.results
  ) {
    action.output.results.forEach((r) => {
      if (r.reference) {
        references[r.reference] = r;
      }
    });
  }

  if (references) {
    let counter = 0;
    const refCounter: { [key: string]: number } = {};
    const footnotes: SlackMessageFootnotes = [];

    const formattedContent = content.replace(
      /:cite\[[a-zA-Z0-9, ]+\]/g,
      (match) => {
        const keys = match.slice(6, -1).split(","); // Slice off ":cite[" and "]" then split by comma.

        return keys
          .map((key) => {
            const k = key.trim();
            const ref = references[k];

            if (ref) {
              if (!refCounter[k]) {
                counter++;
                refCounter[k] = counter;

                let title = "";
                let link = "";

                if (isRetrievalDocumentType(ref)) {
                  title = getTitleFromRetrievedDocument(ref);
                  link = ref.sourceUrl
                    ? ref.sourceUrl
                    : makeDustAppUrl(
                        `/w/${ref.dataSourceWorkspaceId}/builder/data-sources/${
                          ref.dataSourceId
                        }/upsert?documentId=${encodeURIComponent(
                          ref.documentId
                        )}`
                      );
                } else if (isWebsearchResultType(ref)) {
                  title = ref.title;
                  link = ref.sourceUrl;
                }

                footnotes.push({
                  index: counter,
                  link,
                  text: title,
                });

                return `[${refCounter[k]}]`;
              }

              if (ref) {
                if (!refCounter[k]) {
                  counter++;
                  refCounter[k] = counter;
                }

                return `[${refCounter[k]}]`;
              }

              return "";
            }

            return "";
          })
          .join(" ");
      }
    );

    return { formattedContent, footnotes };
  }

  return { formattedContent: removeCitations(content), footnotes: [] };
}

function removeCitations(message: string): string {
  const regex = / ?:cite\[[a-zA-Z0-9, ]+\]/g;
  return message.replace(regex, "");
}
