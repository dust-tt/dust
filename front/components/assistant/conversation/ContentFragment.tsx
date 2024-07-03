import { Citation } from "@dust-tt/sparkle";
import type { CitationType } from "@dust-tt/sparkle/dist/components/Citation";
import type { ContentFragmentType } from "@dust-tt/types";
import {
  isSupportedImageContentFragmentType,
  isSupportedImageContentType,
  isSupportedPlainTextContentType,
} from "@dust-tt/types";

export function ContentFragment({ message }: { message: ContentFragmentType }) {
  let citationType: CitationType = "document";

  if (
    message.contentType === "slack_thread_content" ||
    message.contentType === "dust-application/slack"
  ) {
    citationType = "slack";
  } else if (isSupportedPlainTextContentType(message.contentType)) {
    citationType = "document";
  } else if (isSupportedImageContentType(message.contentType)) {
    citationType = "image";
  }

  return (
    <Citation
      title={message.title}
      size="xs"
      type={citationType}
      href={message.sourceUrl || undefined}
      imgSrc={getViewUrlForContentFragment(message)}
      avatarSrc={message.context.profilePictureUrl ?? undefined}
    />
  );
}

function getViewUrlForContentFragment(message: ContentFragmentType) {
  if (!message.sourceUrl) {
    return undefined;
  }

  if (isSupportedImageContentFragmentType(message.contentType)) {
    return `${message.sourceUrl}?action=view`;
  }

  return undefined;
}
