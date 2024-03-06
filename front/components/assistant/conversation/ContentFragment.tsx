import { Citation } from "@dust-tt/sparkle";
import type { ContentFragmentType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

export function ContentFragment({ message }: { message: ContentFragmentType }) {
  let logoType: "document" | "slack" = "document";
  switch (message.contentType) {
    case "slack_thread_content":
      logoType = "slack";
      break;
    case "file_attachment":
      logoType = "document";
      break;

    default:
      assertNever(message.contentType);
  }
  return (
    <div className="items-center px-3">
      <Citation
        title={message.title}
        size="xs"
        type={logoType}
        href={message.url || undefined}
        avatarUrl={message.context.profilePictureUrl ?? undefined}
      />
    </div>
  );
}
