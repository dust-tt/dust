import { Citation } from "@dust-tt/sparkle";
import type { ContentFragmentType } from "@dust-tt/types";

export function ContentFragment({ message }: { message: ContentFragmentType }) {
  let logoType: "document" | "slack" = "document";

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
  } else {
    throw new Error(`Unsupported ContentFragmentType '${message.contentType}'`);
  }
  return (
    <Citation
      title={message.title}
      size="xs"
      type={logoType}
      href={message.sourceUrl || undefined}
      avatarSrc={message.context.profilePictureUrl ?? undefined}
    />
  );
}
