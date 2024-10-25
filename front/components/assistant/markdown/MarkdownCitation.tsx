import type { Citation } from "@dust-tt/sparkle";

export interface MarkdownCitation {
  description?: string;
  href?: string;
  title: string;
  type: Exclude<React.ComponentProps<typeof Citation>["type"], undefined>;
}
