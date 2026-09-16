import { AttachmentChipCitation } from "@app/components/assistant/conversation/attachment/AttachmentChipCitation";
import type { FileCitationCardProps } from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { FileCitationCard } from "@app/components/assistant/conversation/attachment/FileCitationCard";

// `card` is the Citation card shown under messages; `chip` is the compact
// AttachmentChip of the composer's attachment row.
export type AttachmentCitationVariant = "card" | "chip";

type CitationByVariantProps = FileCitationCardProps & {
  variant: AttachmentCitationVariant;
};

export function CitationByVariant({
  variant,
  size,
  ...props
}: CitationByVariantProps) {
  return variant === "chip" ? (
    <AttachmentChipCitation {...props} />
  ) : (
    <FileCitationCard {...props} size={size} />
  );
}
