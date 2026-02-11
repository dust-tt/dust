import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import type { ConfluenceAncestorType } from "@app/types/connectors/admin/cli";
import { ConfluenceCheckPageExistsResponseSchema } from "@app/types/connectors/admin/cli";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";

export const confluencePageCheckerPlugin = createPlugin({
  manifest: {
    id: "confluence-page-checker",
    name: "Check Confluence Page Exists",
    description:
      "Check if a Confluence page exists and return its ancestors in a markdown tree format",
    resourceTypes: ["data_sources"],
    args: {
      pageUrl: {
        type: "text",
        label: "Page URL",
        description: "The Confluence page URL to check",
      },
    },
  },
  isApplicableTo: (auth, dataSource) => {
    if (!dataSource) {
      return false;
    }

    return dataSource.connectorProvider === "confluence";
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    const { connectorId } = dataSource;
    if (!connectorId) {
      return new Err(new Error("No connector on datasource."));
    }

    const { pageUrl } = args;

    // Validate URL.
    if (!pageUrl || !URL.canParse(pageUrl)) {
      return new Err(new Error("Invalid page URL provided."));
    }

    try {
      const result = await checkConfluencePage({
        connectorId: connectorId.toString(),
        pageUrl,
      });
      if (result.isErr()) {
        return new Err(new Error(result.error.message));
      }

      const decoded = ConfluenceCheckPageExistsResponseSchema.decode(
        result.value
      );
      if (isLeft(decoded)) {
        return new Err(
          new Error(
            `Invalid response from Confluence API: ${reporter.formatValidationErrors(decoded.left)}`
          )
        );
      }

      const { right: response } = decoded;

      if (!response.exists) {
        return new Ok({
          display: "text",
          value: "Page not found on Confluence.",
        });
      }

      const markdownTree = generateMarkdownTree(response.ancestors || []);
      const hasFolderAncestors = response.ancestors.some(
        (a) => a.type === "folder"
      );

      return new Ok({
        display: "markdown",
        value: `Title: ${response.title}\nStatus: ${response.status}\nExists in Dust: ${
          response.existsInDust
        }\nhasReadRestrictions: ${response.hasReadRestrictions}\nhasChildren: ${
          response.hasChildren
        }\nIndexable: ${!hasFolderAncestors}\nHierarchy:\n${markdownTree}`,
      });
    } catch (error) {
      return new Err(new Error(`Failed to check page: ${error}`));
    }
  },
});

async function checkConfluencePage({
  connectorId,
  pageUrl,
}: {
  connectorId: string;
  pageUrl: string;
}) {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const checkPageExistsRes = await connectorsAPI.admin({
    majorCommand: "confluence",
    command: "check-page-exists",
    args: {
      connectorId: Number(connectorId),
      file: undefined,
      forceUpsert: undefined,
      keyInFile: undefined,
      pageId: undefined,
      spaceId: undefined,
      url: pageUrl,
      skipReason: undefined,
    },
  });

  return checkPageExistsRes;
}

function generateMarkdownTree(ancestors: ConfluenceAncestorType[]): string {
  if (ancestors.length === 0) {
    return "No ancestors found.";
  }

  let tree = "";
  for (let i = 0; i < ancestors.length; i++) {
    const ancestor = ancestors[i];
    const isLast = i === ancestors.length - 1;
    const prefix = isLast ? "└── " : "├── ";
    const indent = "│   ".repeat(i);

    if (ancestor.type === "space") {
      tree += `${indent}${prefix}📁 **${ancestor.title}** (Space)\n`;
    } else if (ancestor.type === "folder") {
      tree += `${indent}${prefix}📂 ${ancestor.title}\n`;
    } else {
      tree += `${indent}${prefix}📄 ${ancestor.title}\n`;
    }
  }

  return tree;
}
