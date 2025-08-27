import { DocumentTextIcon, ImageIcon } from "@dust-tt/sparkle";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { ConnectorProvider } from "@app/types";

export function getCitationIcon(type: string, isDark?: boolean) {
  switch (type) {
    case "document":
      return DocumentTextIcon;

    case "image":
      return ImageIcon;

    default:
      if (type in CONNECTOR_CONFIGURATIONS) {
        return CONNECTOR_CONFIGURATIONS[
          type as ConnectorProvider
        ].getLogoComponent(isDark);
      }

      return DocumentTextIcon;
  }
}

// TODO(CANVAS 2025-08-27): Use proper and distinct types for canvas content.
export interface MarkdownCitation {
  description?: string;
  href?: string;
  icon: React.JSX.Element;
  title: string;
}
