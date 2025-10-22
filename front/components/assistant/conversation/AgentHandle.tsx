import { cn } from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";

interface AgentHandleProps {
  assistant: {
    sId: string;
    name: string;
  };
  canMention?: boolean;
  isDisabled?: boolean;
}

export function AgentHandle({
  assistant,
  canMention = true,
  isDisabled = false,
}: AgentHandleProps) {
  const router = useRouter();

  const href = {
    pathname: router.pathname,
    query: { ...router.query, agentDetails: assistant.sId },
  };

  if (!canMention) {
    return <span>{assistant.name}</span>;
  }

  return (
    <Link
      href={href}
      shallow
      className={cn(
        "max-w-[14rem] cursor-pointer truncate transition duration-200 hover:text-highlight active:text-highlight-600 sm:max-w-fit",
        isDisabled && "text-gray-600 text-opacity-75"
      )}
    >
      {assistant.name}
    </Link>
  );
}
