import {
  DocumentTextIcon,
  ExternalLinkIcon,
  IconButton,
  SlackLogo,
} from "@dust-tt/sparkle";
import Link from "next/link";

import { classNames } from "@app/lib/utils";
import { ContentFragmentType } from "@app/types/assistant/conversation";

export function ContentFragment({ message }: { message: ContentFragmentType }) {
  let logo = <DocumentTextIcon className="h-5 w-5 text-slate-500" />;
  switch (message.contentType) {
    case "slack_thread_content":
      logo = <SlackLogo className="h-5 w-5 text-slate-500" />;
      break;
  }
  return (
    <div
      className={classNames(
        "flex w-48 flex-none flex-col gap-2 rounded-xl border border-structure-100 bg-white p-3 sm:w-64"
      )}
    >
      <div className="flex items-center gap-1.5">
        <div className="h-5 w-5">{logo}</div>
        <div className="flex-grow text-xs" />
        {message.url && (
          <Link href={message.url} target="_blank">
            <IconButton icon={ExternalLinkIcon} size="xs" variant="primary" />
          </Link>
        )}
      </div>
      <div className="text-xs font-bold text-element-900">{message.title}</div>
    </div>
  );
}
