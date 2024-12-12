import type {
  AdminSuccessResponseType,
  ConfluenceCommandType,
  ConfluenceUpsertPageResponseType,
} from "@dust-tt/types";

import { default as topLogger } from "@connectors/logger/logger";

export const confluence = async ({
  command,
  args,
}: ConfluenceCommandType): Promise<
  AdminSuccessResponseType | ConfluenceUpsertPageResponseType
> => {
  const logger = topLogger.child({ majorCommand: "confluence", command, args });
  switch (command) {
    case "upsert-page": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.pageId) {
        throw new Error("Missing --pageId argument");
      }
      break;
    }

    default:
      throw new Error("Unknown Confluence command: " + command);
  }
};
