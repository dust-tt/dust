import type { AgentActionPublicType } from "@dust-tt/client";
import {
  isMCPActionType,
  isSearchResultResourceType,
  isWebsearchResultResourceType,
} from "@dust-tt/client";

interface SlackMessageFootnote {
  index: number;
  link: string;
  text: string;
}

export type SlackMessageFootnotes = SlackMessageFootnote[];

export function annotateCitations(
  content: string,
  actions: AgentActionPublicType[]
): { formattedContent: string; footnotes: SlackMessageFootnotes } {
  const references: {
    [key: string]: {
      reference: string;
      link: string;
      title: string;
    };
  } = {};

  for (const action of actions) {
    if (action && isMCPActionType(action) && action.output) {
      // Handle MCP search results
      action.output?.filter(isSearchResultResourceType).forEach((o) => {
        if (o.type === "resource" && o.resource.ref) {
          const r = o.resource;
          const ref = r.ref;
          if (ref) {
            references[ref] = {
              reference: ref,
              link: r.uri,
              title: r.text,
            };
          }
        }
      });

      // Handle MCP websearch results
      action.output?.filter(isWebsearchResultResourceType).forEach((o) => {
        if (o.type === "resource" && o.resource.reference) {
          const r = o.resource;
          const ref = r.reference;
          if (ref) {
            references[ref] = {
              reference: ref,
              link: r.uri,
              title: r.title,
            };
          }
        }
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
