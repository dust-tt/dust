import {
  Chip,
  DocumentTextIcon,
  ExternalLinkIcon,
  Icon,
  SlackLogo,
} from "@dust-tt/sparkle";
import Link from "next/link";

import { ContentFragmentType } from "@app/types/assistant/conversation";

export function ContentFragment({ message }: { message: ContentFragmentType }) {
  let logo = DocumentTextIcon;
  if (message.url) {
    if (message.url.includes("slack.comm")) {
      logo = SlackLogo;
    }
  }
  return (
    <Chip.List className="s-w-60">
      <Chip size="xs" color="emerald">
        <Icon visual={logo} size="xs" />
        {message.title}
        {message.url && (
          <Link href={message.url}>
            <Icon visual={ExternalLinkIcon} size="xs" />
          </Link>
        )}
      </Chip>
    </Chip.List>
  );
}
