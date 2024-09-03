import { Citation, ZoomableImageCitationWrapper } from "@dust-tt/sparkle";
import type { ContentFragmentType } from "@dust-tt/types";
import { isSupportedImageContentType } from "@dust-tt/types";

export function ContentFragment({ message }: { message: ContentFragmentType }) {
  if (isSupportedImageContentType(message.contentType)) {
    return (
      <ZoomableImageCitationWrapper
        size="xs"
        title={message.title}
        imgSrc={`${message.sourceUrl}?action=view`}
        alt={message.title}
      />
    );
  }

  const citationType = ["dust-application/slack"].includes(message.contentType)
    ? "slack"
    : "document";

  return (
    <Citation
      title={message.title}
      size="xs"
      type={citationType}
      href={message.sourceUrl || undefined}
      avatarSrc={message.context.profilePictureUrl ?? undefined}
    />
  );
}
