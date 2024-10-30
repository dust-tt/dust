import { CitationType } from "@sparkle/components/Citation";

export interface MarkdownCitation {
  description?: string;
  href?: string;
  title: string;
  type: CitationType;
}
