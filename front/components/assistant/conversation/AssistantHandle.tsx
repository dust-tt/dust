import { cn } from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";

interface AssistantHandleProps {
  assistant: {
    sId: string;
    name: string;
  };
  canMention?: boolean;
  isDisabled?: boolean;
}

export function AssistantHandle({
  assistant,
  canMention = true,
  isDisabled = false,
}: AssistantHandleProps) {
  const router = useRouter();

  const href = {
    pathname: router.pathname,
    query: { ...router.query, agentDetails: assistant.sId },
  };

  if (!canMention) {
    return <span>@{assistant.name}</span>;
  }

  return (
    <Link
      href={href}
      shallow
      className={cn(
        "cursor-pointer transition duration-200 hover:text-highlight active:text-highlight-600",
        isDisabled && "text-gray-600 text-opacity-75"
      )}
    >
      @{assistant.name}
    </Link>
  );
}
