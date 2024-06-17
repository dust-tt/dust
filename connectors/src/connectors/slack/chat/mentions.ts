import type { AgentActionType, RetrievalDocumentType } from "@dust-tt/types";
import { isRetrievalActionType } from "@dust-tt/types";

import { makeDustAppUrl } from "@connectors/connectors/slack/chat/utils";

export function annotateCitations(
  content: string,
  action: AgentActionType | null
): string {
  const references: { [key: string]: RetrievalDocumentType } = {};

  if (action && isRetrievalActionType(action) && action.documents) {
    action.documents.forEach((d) => {
      references[d.reference] = d;
    });
  }

  if (references) {
    let counter = 0;
    const refCounter: { [key: string]: number } = {};

    return content.replace(/:cite\[[a-zA-Z0-9, ]+\]/g, (match) => {
      const keys = match.slice(6, -1).split(","); // Slice off ":cite[" and "]" then split by comma.

      return keys
        .map((key) => {
          const k = key.trim();
          const ref = references[k];

          if (ref) {
            if (!refCounter[k]) {
              counter++;
              refCounter[k] = counter;
            }

            const link = ref.sourceUrl
              ? ref.sourceUrl
              : makeDustAppUrl(
                  `/w/${ref.dataSourceWorkspaceId}/builder/data-sources/${
                    ref.dataSourceId
                  }/upsert?documentId=${encodeURIComponent(ref.documentId)}`
                );

            return `[${refCounter[k]}](${link})`;
          }

          return "";
        })
        .join(" ");
    });
  }

  return removeCitations(content);
}

function removeCitations(message: string): string {
  const regex = / ?:cite\[[a-zA-Z0-9, ]+\]/g;
  return message.replace(regex, "");
}
