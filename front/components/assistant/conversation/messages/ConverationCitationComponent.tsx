import { Citation, ZoomableImageCitationWrapper } from "@dust-tt/sparkle";
import type { CitationType } from "@dust-tt/sparkle/dist/esm/components/Citation";

export type ConversationCitationType = {
  avatarSrc?: string;
  citationType: CitationType;
  id: string;
  isZoomable: boolean;
  sourceUrl?: string;
  title: string;
};

type ConverationCitationComponentProps = {
  citation: ConversationCitationType;
};

export function ConverationCitationComponent({
  citation,
}: ConverationCitationComponentProps) {
  if (citation.isZoomable && citation.sourceUrl) {
    return (
      <ZoomableImageCitationWrapper
        size="xs"
        title={citation.title}
        imgSrc={citation.sourceUrl}
        alt={citation.title}
      />
    );
  }

  return (
    <Citation
      title={citation.title}
      size="xs"
      type={citation.citationType}
      href={citation.sourceUrl}
      avatarSrc={citation.avatarSrc}
    />
  );
}
