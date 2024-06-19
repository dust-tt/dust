import type { AgentActionType } from "@dust-tt/types";
import {
  getTitleFromRetrievedDocument,
  isRetrievalActionType,
  isWebsearchActionType,
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
    [key: string]: {
      link: string;
      text: string;
    };
  } = {};

  if (action && isRetrievalActionType(action) && action.documents) {
    action.documents.forEach((d) => {
      references[d.reference] = {
        link: makeDustAppUrl(
          `/w/${d.dataSourceWorkspaceId}/builder/data-sources/${
            d.dataSourceId
          }/upsert?documentId=${encodeURIComponent(d.documentId)}`
        ),
        text: getTitleFromRetrievedDocument(d),
      };
    });
  } else if (
    action &&
    isWebsearchActionType(action) &&
    action.output?.results
  ) {
    action.output.results.forEach((r) => {
      if (r.reference) {
        references[r.reference] = {
          link: r.sourceUrl,
          text: r.title,
        };
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

                footnotes.push({
                  index: counter,
                  link: ref.link,
                  text: ref.text,
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
