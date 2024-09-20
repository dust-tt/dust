import type { AgentActionType } from "@dust-tt/types";
import {
  getTitleFromRetrievedDocument,
  isRetrievalActionType,
  isWebsearchActionType,
} from "@dust-tt/types";

interface SlackMessageFootnote {
  index: number;
  link: string;
  text: string;
}

export type SlackMessageFootnotes = SlackMessageFootnote[];

export function annotateCitations(
  content: string,
  actions: AgentActionType[]
): { formattedContent: string; footnotes: SlackMessageFootnotes } {
  const references: {
    [key: string]: {
      reference: string;
      link: string;
      title: string;
    };
  } = {};

  for (const action of actions) {
    if (action && isRetrievalActionType(action) && action.documents) {
      action.documents.forEach((d) => {
        // If the document has no sourceUrl we skip the citation.
        if (d.sourceUrl) {
          references[d.reference] = {
            reference: d.reference,
            link: d.sourceUrl,
            title: getTitleFromRetrievedDocument(d),
          };
        }
      });
    }
    if (action && isWebsearchActionType(action) && action.output) {
      action.output.results.forEach((r) => {
        references[r.reference] = {
          reference: r.reference,
          link: r.link,
          title: r.title,
        };
      });
    }
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
                  text: ref.title,
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
