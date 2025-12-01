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

export type ToolAttachment = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
};

export type SearchableProvider = {
  search: (params: {
    accessToken: string;
    query: string;
    pageSize: number;
  }) => Promise<ToolSearchRawNode[]>;
  getFile: (params: {
    accessToken: string;
    fileId: string;
  }) => Promise<ToolAttachment>;
};
