import { DocumentTextIcon, FaviconIcon, ImageIcon } from "@dust-tt/sparkle";
import React from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { ConnectorProvider } from "@app/types";
import type { AllSupportedFileContentType } from "@app/types";

export function getCitationIcon(
  type: string,
  isDark?: boolean,
  faviconUrl?: string,
  websiteUrl?: string
) {
  switch (type) {
    case "document":
      return DocumentTextIcon;

    case "image":
      return ImageIcon;

    case "webcrawler":
      // For webcrawler (website citations), use favicon if available, otherwise fall back to GlobeAltIcon
      return function FaviconIconComponent() {
        return (
          <FaviconIcon
            className="h-3 w-3"
            faviconUrl={faviconUrl}
            websiteUrl={websiteUrl}
          />
        );
      };

    default:
      if (type in CONNECTOR_CONFIGURATIONS) {
        return CONNECTOR_CONFIGURATIONS[
          type as ConnectorProvider
        ].getLogoComponent(isDark);
      }

      return DocumentTextIcon;
  }
}

// TODO(interactive_content 2025-08-27): Use proper and distinct types for Interactive Content.
export interface MarkdownCitation {
  description?: string;
  href?: string;
  icon: React.JSX.Element;
  title: string;
  contentType:
    | AllSupportedFileContentType
    | "application/vnd.dust.tool-output.data-source-search-result"
    | "application/vnd.dust.tool-output.websearch-result";
  fileId: string;
}
