import type { LightAgentConfigurationType } from "@dust-tt/client";
import Link from "next/link";
import { useRouter } from "next/router";

interface AssistantHandleProps {
  assistant: LightAgentConfigurationType;
  canMention?: boolean;
}

export function AssistantHandle({
  assistant,
  canMention = true,
}: AssistantHandleProps) {
  const router = useRouter();

  const href = {
    pathname: router.pathname,
    query: { ...router.query, assistantDetails: assistant.sId },
  };

  if (!canMention) {
    return <span>@{assistant.name}</span>;
  }

  return (
    <Link
      href={href}
      shallow
      className="cursor-pointer transition duration-200 hover:text-highlight active:text-highlight-600"
    >
      @{assistant.name}
    </Link>
  );
}
