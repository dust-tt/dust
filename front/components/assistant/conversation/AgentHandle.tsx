import { LinkWrapper, useAppRouter } from "@app/lib/platform";
import { cn } from "@dust-tt/sparkle";

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
  const router = useAppRouter();

  const href = {
    pathname: router.pathname,
    query: { ...router.query, agentDetails: agent.sId },
    hash: router.asPath.split("#")[1] || undefined,
  };

  if (!canMention) {
    return <span>{agent.name}</span>;
  }

  return (
    <LinkWrapper
      href={href}
      shallow
      className={cn(
        "max-w-[14rem] cursor-pointer truncate transition duration-200 hover:text-highlight active:text-highlight-600 sm:max-w-fit",
        isDisabled && "text-gray-600 text-opacity-75"
      )}
    >
      {agent.name}
    </LinkWrapper>
  );
}
