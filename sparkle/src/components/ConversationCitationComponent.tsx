import React from "react";

import { Citation } from "@sparkle/components/Citation";
import { CitationType } from "@sparkle/components/Citation";
import { ZoomableImageCitationWrapper } from "@sparkle/components/ZoomableImageCitationWrapper";

export type ConversationCitationType = {
  avatarSrc?: string;
  citationType: CitationType;
  id: string;
  isZoomable: boolean;
  sourceUrl?: string;
  title: string;
};

type ConversationCitationComponentProps = {
  citation: ConversationCitationType;
};

export function ConversationCitationComponent({
  citation,
}: ConversationCitationComponentProps) {
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
