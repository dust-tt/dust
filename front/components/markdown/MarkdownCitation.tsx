import { DocumentTextIcon, FaviconIcon, ImageIcon } from "@dust-tt/sparkle";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { ConnectorProvider } from "@app/types";

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
        return <FaviconIcon faviconUrl={faviconUrl} websiteUrl={websiteUrl} />;
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

// TODO(CONTENT_CREATION 2025-08-27): Use proper and distinct types for content creation content.
export interface MarkdownCitation {
  description?: string;
  href?: string;
  icon: React.JSX.Element;
  title: string;
}
