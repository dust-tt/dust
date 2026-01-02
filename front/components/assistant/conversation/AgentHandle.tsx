import { cn } from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";

interface AgentHandleProps {
  agent: {
    sId: string;
    name: string;
  };
  canMention?: boolean;
  isDisabled?: boolean;
}

export function AgentHandle({
  agent,
  canMention = true,
  isDisabled = false,
}: AgentHandleProps) {
  const router = useRouter();

  const href = {
    pathname: router.pathname,
    query: { ...router.query, agentDetails: agent.sId },
    hash: router.asPath.split("#")[1] || undefined,
  };

  if (!canMention) {
    return <span>{agent.name}</span>;
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
      {agent.name}
    </Link>
  );
}
