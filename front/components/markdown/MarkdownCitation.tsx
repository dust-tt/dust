import { DocumentTextIcon, ImageIcon } from "@dust-tt/sparkle";
import type { SVGProps } from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { CONNECTOR_PROVIDERS } from "@app/types";

const CITATION_ICONS = [...CONNECTOR_PROVIDERS, "document", "image"] as const;

export type CitationIconType = (typeof CITATION_ICONS)[number];

// Maps citation types to their corresponding SVG components, including both connector logos and standard icons.
export const citationIconMap = {
  ...Object.fromEntries(
    Object.entries(CONNECTOR_CONFIGURATIONS).map(
      ([key, { getLogoComponent }]) => [key, getLogoComponent()]
    )
  ),
  document: DocumentTextIcon,
  image: ImageIcon,
} satisfies Record<
  CitationIconType,
  (props: SVGProps<SVGSVGElement>) => React.JSX.Element
>;

export interface MarkdownCitation {
  description?: string;
  href?: string;
  title: string;
  icon: React.JSX.Element;
}
