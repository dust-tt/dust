import { z } from "zod";

import type { ContentNodeType } from "../../core/content_node";

const ParentsToAddRemoveSchema = z.object({
  parentsToAdd: z.array(z.string()).optional(),
  parentsToRemove: z.array(z.string()).optional(),
});

const ParentsInSchema = z.object({
  parentsIn: z.array(z.string()),
});

// It's important to have ParentsInSchema first, as ParentsToAddRemoveSchema only has optional fields and would always match if it were first.
export const PatchDataSourceViewSchema = z.union([
  ParentsInSchema,
  ParentsToAddRemoveSchema,
]);

export type PatchDataSourceViewType = z.infer<typeof PatchDataSourceViewSchema>;

export type LightContentNode = {
  expandable: boolean;
  internalId: string;
  lastUpdatedAt: number | null;
  parentInternalId: string | null;
  preventSelection?: boolean;
  sourceUrl: string | null;
  title: string;
  type: ContentNodeType;
  mimeType?: string | null;
};

export const DATA_SOURCE_VIEW_CATEGORIES = [
  "managed",
  "folder",
  "website",
  "apps",
  "actions",
  "triggers",
] as const;

export type DataSourceViewCategory =
  (typeof DATA_SOURCE_VIEW_CATEGORIES)[number];

export function isValidDataSourceViewCategory(
  category: unknown
): category is DataSourceViewCategory {
  return DATA_SOURCE_VIEW_CATEGORIES.includes(
    category as DataSourceViewCategory
  );
}

export const DATA_SOURCE_VIEW_CATEGORIES_DISPLAY_NAMES: Record<
  DataSourceViewCategory,
  string
> = {
  managed: "Connections",
  folder: "Folders",
  website: "Websites",
  apps: "Apps",
  actions: "Tools",
  triggers: "Triggers",
};

export type DataSourceViewCategoryWithoutApps = Exclude<
  DataSourceViewCategory,
  "apps" | "actions"
>;

export function isDataSourceViewCategoryWithoutApps(
  category: unknown
): category is DataSourceViewCategoryWithoutApps {
  return (
    isValidDataSourceViewCategory(category) &&
    category !== "triggers" &&
    category !== "apps" &&
    category !== "actions"
  );
}

export function isWebsiteOrFolderCategory(
  category: unknown
): category is Extract<DataSourceViewCategory, "website" | "folder"> {
  return category === "website" || category === "folder";
}

export function isSpreadsheetFolderContentNode(
  contentNode: LightContentNode
): boolean {
  return (
    contentNode.type === "folder" &&
    contentNode.mimeType === "application/vnd.dust.folder.spreadsheet"
  );
}
