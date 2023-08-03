import { CheckCircleIcon } from "@dust-tt/sparkle";
import { LinkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

export function CopyLinkToClipboard({
  link,
  children,
}: React.PropsWithChildren<{ link: string }>) {
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const handleClick = async () => {
    await navigator.clipboard.writeText(link);
    setConfirmed(true);
    setTimeout(() => {
      setConfirmed(false);
    }, 1000);
  };

  return (
    <span className="hover:cursor-pointer">
      <a onClick={handleClick}>
        {children}{" "}
        {confirmed ? (
          <CheckCircleIcon className="s-h-5 s-w-5 inline-block text-action-500" />
        ) : (
          <LinkIcon className="s-h-5 s-w-5 inline-block text-gray-300 hover:text-action-500" />
        )}
      </a>
    </span>
  );
}
