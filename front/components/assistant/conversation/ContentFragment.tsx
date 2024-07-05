import { Citation, ZoomableImageCitationWrapper } from "@dust-tt/sparkle";
import type { CitationType } from "@dust-tt/sparkle/dist/esm/components/Citation";
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

  const citationType: CitationType = [
    "slack_thread_content",
    "dust-application/slack",
  ].includes(message.contentType)
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
