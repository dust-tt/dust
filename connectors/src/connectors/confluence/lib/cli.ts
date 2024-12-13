import type {
  AdminSuccessResponseType,
  ConfluenceCommandType,
  ConfluenceUpsertPageResponseType,
} from "@dust-tt/types";
import assert from "assert";
import fs from "fs/promises";

import { confluenceUpsertPageWithFullParentsActivity } from "@connectors/connectors/confluence/temporal/activities";
import { default as topLogger } from "@connectors/logger/logger";

interface cachedSpace {
  spaceName: string | null;
  spaceHierarchy: Record<string, string | null>;
}

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
      const { connectorId, pageId } = args;
      const success = await confluenceUpsertPageWithFullParentsActivity({
        connectorId,
        pageId,
      });
      return { success };
    }
    case "upsert-pages": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.file) {
        throw new Error("Missing --file argument");
      }
      if (!args.keyInFile) {
        throw new Error("Missing --keyInFile argument");
      }
      const connectorId = args.connectorId;
      const file = args.file;
      const keyInFile = args.keyInFile;

      // parsing the JSON file
      const fileContent = await fs.readFile(file, "utf-8");
      const jsonArray = JSON.parse(fileContent);
      assert(Array.isArray(jsonArray), "The file content is not an array.");

      const pageIds = jsonArray.map((entry) => {
        assert(
          keyInFile in entry,
          `Key "${keyInFile}" not found in entry ${JSON.stringify(entry)}`
        );
        return entry[keyInFile];
      });

      let allSuccesses = true;
      const cachedSpaceNames: Record<string, string> = {};
      const cachedSpaceHierarchies: Record<
        string,
        Record<string, string | null>
      > = {};

      for (const pageId of pageIds) {
        const success = await confluenceUpsertPageWithFullParentsActivity({
          connectorId,
          pageId,
          cachedSpaceNames,
          cachedSpaceHierarchies,
        });
        if (!success) {
          logger.error({ pageId }, "Failed to upsert page");
          allSuccesses = false;
        }
      }
      return { success: allSuccesses };
    }

    default:
      throw new Error("Unknown Confluence command: " + command);
  }
};
