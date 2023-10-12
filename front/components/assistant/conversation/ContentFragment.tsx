import { Citation } from "@dust-tt/sparkle";

import { assertNever } from "@app/lib/utils";
import { ContentFragmentType } from "@app/types/assistant/conversation";

export function ContentFragment({ message }: { message: ContentFragmentType }) {
  let logoType: "document" | "slack" = "document";
  switch (message.contentType) {
    case "slack_thread_content":
      logoType = "slack";
      break;

    default:
      assertNever(message.contentType);
  }
  return (
    <Citation
      title={message.title}
      type={logoType}
      href={message.url || undefined}
    />
  );
}
