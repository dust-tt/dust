import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import type { ContentNodeType } from "@app/types";

export type ToolSearchRawNode = {
  internalId: string;
  title: string;
  mimeType: string;
  type: ContentNodeType;
  sourceUrl: string | null;
};

export type ToolSearchNode = ToolSearchRawNode & {
  serverViewId: string;
  serverName: string;
  serverIcon: CustomResourceIconType | InternalAllowedIconType;
};

export type ToolSeachResults = {
  nodes: ToolSearchNode[];
  resultsCount: number;
};

export type ToolSearchParams = {
  accessToken: string;
  query: string;
  pageSize: number;
};

export type ToolDownloadParams = {
  accessToken: string;
  internalId: string;
};

export type ToolDownloadResult = {
  content: string;
  fileName: string;
  mimeType: string;
};

export type SearchableTool = {
  search: (params: ToolSearchParams) => Promise<ToolSearchRawNode[]>;
  download: (params: ToolDownloadParams) => Promise<ToolDownloadResult>;
};
