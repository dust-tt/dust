import type { AllSupportedWithDustSpecificFileContentType } from "@app/types";

// TODO(interactive_content 2025-08-27): Use proper and distinct types for Interactive Content.
export interface MCPReferenceCitation {
  provider?: string;
  description?: string;
  href?: string;
  faviconUrl?: string;
  title: string;
  contentType: AllSupportedWithDustSpecificFileContentType;
  fileId: string;
}
