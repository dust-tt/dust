import { Citation } from "@dust-tt/sparkle";
import type { ContentFragmentType } from "@dust-tt/types";

export function ContentFragment({ message }: { message: ContentFragmentType }) {
  let logoType: "document" | "slack" | "image" = "document";

  // TODO: Improve.
  if (
    message.contentType === "slack_thread_content" ||
    message.contentType === "dust-application/slack"
  ) {
    logoType = "slack";
  } else if (
    message.contentType.startsWith("text/") ||
    message.contentType === "application/pdf" ||
    message.contentType === "file_attachment"
  ) {
    logoType = "document";
  } else if (message.contentType.startsWith("image/")) {
    logoType = "image";
  } else {
    throw new Error(`Unsupported ContentFragmentType '${message.contentType}'`);
  }
  return (
    <Citation
      title={message.title}
      size="xs"
      type={logoType}
      href={message.sourceUrl || undefined}
      imgSrc={
        logoType === "image" ? getViewUrlForContentFragment(message) : undefined
      }
      avatarSrc={message.context.profilePictureUrl ?? undefined}
    />
  );
}

function getViewUrlForContentFragment(message: ContentFragmentType) {
  if (!message.sourceUrl) {
    return undefined;
  }

  return `${message.sourceUrl}&action=view`;
}
