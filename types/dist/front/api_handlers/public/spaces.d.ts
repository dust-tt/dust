import * as t from "io-ts";
import { ContentNodeType } from "../../..";
export declare const PatchDataSourceViewSchema: t.UnionC<[t.TypeC<{
    parentsToAdd: t.UnionC<[t.ArrayC<t.StringC>, t.UndefinedC]>;
    parentsToRemove: t.UnionC<[t.ArrayC<t.StringC>, t.UndefinedC]>;
}>, t.TypeC<{
    parentsIn: t.ArrayC<t.StringC>;
}>]>;
export type PatchDataSourceViewType = t.TypeOf<typeof PatchDataSourceViewSchema>;
export type LightContentNode = {
    expandable: boolean;
    internalId: string;
    lastUpdatedAt: number | null;
    parentInternalId: string | null;
    preventSelection?: boolean;
    sourceUrl: string | null;
    title: string;
    type: ContentNodeType;
};
export declare const DATA_SOURCE_VIEW_CATEGORIES: readonly ["managed", "folder", "website", "apps"];
export type DataSourceViewCategory = (typeof DATA_SOURCE_VIEW_CATEGORIES)[number];
export declare function isValidDataSourceViewCategory(category: unknown): category is DataSourceViewCategory;
export type DataSourceViewCategoryWithoutApps = Exclude<DataSourceViewCategory, "apps">;
export declare function isDataSourceViewCategoryWithoutApps(category: unknown): category is DataSourceViewCategoryWithoutApps;
export declare function isWebsiteOrFolderCategory(category: unknown): category is Extract<DataSourceViewCategory, "website" | "folder">;
//# sourceMappingURL=spaces.d.ts.map