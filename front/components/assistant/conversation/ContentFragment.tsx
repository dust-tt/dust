import { Citation } from "@dust-tt/sparkle";
import type { ContentFragmentType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

export function ContentFragment({ message }: { message: ContentFragmentType }) {
  let logoType: "document" | "slack" = "document";
  switch (message.contentType) {
    case "slack_thread_content":
    case "dust-application/slack":
      logoType = "slack";
      break;
    case "text/plain":
    case "text/csv":
    case "text/markdown":
    case "text/tsv":
    case "text/comma-separated-values":
    case "text/tab-separated-values":
    case "application/pdf":
    case "file_attachment":
      logoType = "document";
      break;

    default:
      assertNever(message.contentType);
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
