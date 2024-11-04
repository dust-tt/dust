import type { CitationType } from "@dust-tt/sparkle";

export interface MarkdownCitation {
  description?: string;
  href?: string;
  title: string;
  type: CitationType;
}
