import { DocumentTextIcon, ImageIcon } from "@dust-tt/sparkle";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { ConnectorProvider } from "@app/types";

export function getCitationIcon(
  type: ConnectorProvider | "document" | "image"
) {
  switch (type) {
    case "document":
      return () => DocumentTextIcon;
    case "image":
      return () => ImageIcon;
    default:
      return CONNECTOR_CONFIGURATIONS[provider].getLogoComponent;
  }
}

export interface MarkdownCitation {
  description?: string;
  href?: string;
  title: string;
  icon: React.JSX.Element;
}
