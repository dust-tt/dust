import { DocumentTextIcon, ImageIcon } from "@dust-tt/sparkle";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { CONNECTOR_PROVIDERS } from "@app/types";

const CITATION_ICONS = [...CONNECTOR_PROVIDERS, "document", "image"] as const;

export type CitationIconType = (typeof CITATION_ICONS)[number];

// Maps citation types to their corresponding SVG components, including both connector logos and standard icons.
export const citationIconMap = {
  ...(Object.fromEntries(
    Object.entries(CONNECTOR_CONFIGURATIONS).map(
      ([key, { getLogoComponent }]) => [key, getLogoComponent]
    )
  ) as Record<
    CONNECTOR_PROVIDERS,
    (isDark?: boolean) => (props: SVGProps<SVGSVGElement>) => React.JSX.Element
  >), // this type cast is a bit unfortunate, but hard to get rid of
  document: () => DocumentTextIcon,
  image: () => ImageIcon,
} satisfies Record<
  CitationIconType,
  (isDark?: boolean) => (props: SVGProps<SVGSVGElement>) => React.JSX.Element
>;

export interface MarkdownCitation {
  description?: string;
  href?: string;
  title: string;
  icon: React.JSX.Element;
}
