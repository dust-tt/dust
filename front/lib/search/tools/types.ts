import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import type { ContentNodeType } from "@app/types";

export type ToolSearchRawResult = {
  externalId: string;
  title: string;
  mimeType: string;
  type: ContentNodeType;
  sourceUrl: string | null;
};

export type ToolSearchResult = ToolSearchRawResult & {
  serverViewId: string;
  serverName: string;
  serverIcon: CustomResourceIconType | InternalAllowedIconType;
};

export type ToolSearchParams = {
  accessToken: string;
  query: string;
  pageSize: number;
};

export type ToolDownloadParams = {
  accessToken: string;
  externalId: string;
};

export type ToolDownloadResult = {
  content: string;
  fileName: string;
  contentType: "text/markdown" | "text/csv" | "text/plain";
};

export type SearchableTool = {
  search: (params: ToolSearchParams) => Promise<ToolSearchRawResult[]>;
  download: (params: ToolDownloadParams) => Promise<ToolDownloadResult>;
};
