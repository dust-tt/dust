import { DocumentTextIcon, ImageIcon } from "@dust-tt/sparkle";
import type { SVGProps } from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { CONNECTOR_PROVIDERS } from "@app/types";

const CITATION_ICONS = [...CONNECTOR_PROVIDERS, "document", "image"] as const;

export type CitationIconType = (typeof CITATION_ICONS)[number];

export const citationIconMap: Record<
  CitationIconType,
  (props: SVGProps<SVGSVGElement>) => React.JSX.Element
> = {
  ...(Object.fromEntries(
    Object.entries(CONNECTOR_CONFIGURATIONS).map(([key, value]) => [
      key,
      value.getLogoComponent(),
    ])
  ) as Record<ConnectorProvider, React.JSX.Element>),
  document: DocumentTextIcon,
  image: ImageIcon,
};

export interface MarkdownCitation {
  description?: string;
  href?: string;
  title: string;
  icon: React.JSX.Element;
}
