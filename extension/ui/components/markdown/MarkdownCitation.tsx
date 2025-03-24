import { CONNECTOR_CONFIGURATIONS } from "@app/shared/lib/connector_providers";
import type { ConnectorProvider } from "@dust-tt/client";
import { DocumentTextIcon, ImageIcon } from "@dust-tt/sparkle";

export function getCitationIcon(
  type: ConnectorProvider | "document" | "image",
  isDark?: boolean
) {
  switch (type) {
    case "document":
      return DocumentTextIcon;
    case "image":
      return ImageIcon;
    default:
      return CONNECTOR_CONFIGURATIONS[type].getLogoComponent(isDark);
  }
}

export interface MarkdownCitation {
  description?: string;
  href?: string;
  title: string;
  icon: React.JSX.Element;
}
