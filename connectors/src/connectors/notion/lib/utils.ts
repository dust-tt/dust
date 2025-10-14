import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { Logger } from "pino";

import { getParents } from "@connectors/connectors/notion/lib/parents";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";

// Define the type codec for the Notion OAuth response
export const NotionOAuthResponse = t.type({
  workspace_id: t.string,
});

export type NotionOAuthResponseType = t.TypeOf<typeof NotionOAuthResponse>;

/**
 * Validates a Notion OAuth response to ensure it contains a workspace_id
 *
 * @param rawJson The raw JSON response from the OAuth service
 * @param logger Logger instance for error reporting
 * @returns The validation result (Either)
 */
export function validateNotionOAuthResponse(
  rawJson: unknown,
  logger: Logger
): Result<NotionOAuthResponseType, Error> {
  const validationResult = NotionOAuthResponse.decode(rawJson);

  if (isLeft(validationResult)) {
    logger.error(
      { errors: validationResult.left },
      "Invalid Notion OAuth response"
    );
    return new Err(new Error("Invalid Notion OAuth response"));
  }

  return new Ok(validationResult.right);
}

export type BreadcrumbItem = {
  id: string;
  title: string;
  type: "page" | "database" | "workspace";
};

/**
 * Builds breadcrumb trail for a Notion page or database
 * @param connectorId - The connector ID
 * @param pageOrDbId - The UUID-formatted Notion page or database ID
 * @param resourceType - Whether this is a page or database
 * @returns Array of breadcrumb items from root to current item
 */
export async function buildNotionBreadcrumbs(
  connectorId: number,
  pageOrDbId: string,
  resourceType: "page" | "database"
): Promise<BreadcrumbItem[]> {
  const parentIds = await getParents(
    connectorId,
    pageOrDbId,
    [],
    undefined,
    undefined
  );

  // Remove the first ID (which is the page/db itself)
  const breadcrumbIds = parentIds.slice(1);

  const breadcrumbs: BreadcrumbItem[] = [];

  const current =
    resourceType === "page"
      ? await NotionPage.findOne({
          where: { notionPageId: pageOrDbId, connectorId },
        })
      : await NotionDatabase.findOne({
          where: { notionDatabaseId: pageOrDbId, connectorId },
        });

  if (current) {
    breadcrumbs.push({
      id: pageOrDbId,
      title: current.title || "Untitled",
      type: resourceType,
    });
  }

  for (const parentId of breadcrumbIds) {
    const page = await NotionPage.findOne({
      where: { notionPageId: parentId, connectorId },
    });

    if (page) {
      breadcrumbs.unshift({
        id: parentId,
        title: page.title || "Untitled",
        type: "page",
      });
      continue;
    }

    const db = await NotionDatabase.findOne({
      where: { notionDatabaseId: parentId, connectorId },
    });

    if (db) {
      breadcrumbs.unshift({
        id: parentId,
        title: db.title || "Untitled",
        type: "database",
      });
    }
  }

  if (current && current.parentType === "workspace") {
    breadcrumbs.unshift({
      id: "workspace",
      title: "Workspace",
      type: "workspace",
    });
  } else if (breadcrumbs.length > 1) {
    const firstParentId = breadcrumbIds[breadcrumbIds.length - 1];
    const firstParent =
      (await NotionPage.findOne({
        where: { notionPageId: firstParentId, connectorId },
      })) ||
      (await NotionDatabase.findOne({
        where: { notionDatabaseId: firstParentId, connectorId },
      }));

    if (firstParent && firstParent.parentType === "workspace") {
      breadcrumbs.unshift({
        id: "workspace",
        title: "Workspace",
        type: "workspace",
      });
    }
  }

  return breadcrumbs;
}

/**
 * Extracts and formats a Notion page/database ID from a Notion URL (throws on error)
 * @param url - The Notion URL
 * @returns The UUID-formatted ID
 * @throws Error if URL is invalid
 */
export function pageOrDbIdFromUrl(url: string): string {
  // If it is already a UUID, return it directly. This allows users to enter
  // either a full URL or just the ID (e.g. in the Check URL Poke UI).
  const trimmed = url.trim();
  if (
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      trimmed
    )
  ) {
    return trimmed;
  }

  const u = new URL(trimmed);
  const last = u.pathname.split("/").pop();
  if (!last) {
    throw new Error(`Unhandled URL (could not get "last"): ${url}`);
  }
  const id = last.split("-").pop();
  if (!id || id.length !== 32) {
    throw new Error(`Unhandled URL (could not get 32 char ID): ${url}`);
  }

  const pageOrDbId =
    id.slice(0, 8) +
    "-" +
    id.slice(8, 12) +
    "-" +
    id.slice(12, 16) +
    "-" +
    id.slice(16, 20) +
    "-" +
    id.slice(20);

  return pageOrDbId;
}
