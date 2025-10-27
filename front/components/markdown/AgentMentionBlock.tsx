import {
  ChatBubbleBottomCenterTextIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EyeIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { visit } from "unist-util-visit";

import { useURLSheet } from "@app/hooks/useURLSheet";
import { getConversationRoute, setQueryParam } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";

// Not exported, the one exported is getMentionPlugin since we need to pass the owner.
function AgentMentionBlock({
  owner,
  agentName,
  agentSId,
}: {
  owner: WorkspaceType;
  agentName: string;
  agentSId: string;
}) {
  const router = useRouter();
  const { onOpenChange: onOpenChangeAssistantModal } =
    useURLSheet("agentDetails");

  const handleStartConversation = async () => {
    await router.push(
      getConversationRoute(owner.sId, "new", `agent=${agentSId}`)
    );
  };

  const handleSeeDetails = () => {
    onOpenChangeAssistantModal(true);
    setQueryParam(router, "agentDetails", agentSId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span className="inline-block cursor-pointer font-medium text-highlight-500">
          @{agentName}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={handleStartConversation}
          icon={() => <ChatBubbleBottomCenterTextIcon />}
          label={`New conversation with @${agentName}`}
        />
        <DropdownMenuItem
          onClick={handleSeeDetails}
          icon={() => <EyeIcon />}
          label={`About @${agentName}`}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function agentMentionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      if (node.name === "mention" && node.children[0]) {
        const data = node.data || (node.data = {});
        data.hName = "mention";
        data.hProperties = {
          agentSId: node.attributes.sId,
          agentName: node.children[0].value,
        };
      }
    });
  };
}

export function getAgentMentionPlugin(owner: WorkspaceType) {
  const AgentMentionPlugin = ({
    agentName,
    agentSId,
  }: {
    agentName: string;
    agentSId: string;
  }) => {
    return (
      <AgentMentionBlock
        owner={owner}
        agentName={agentName}
        agentSId={agentSId}
      />
    );
  };

  return AgentMentionPlugin;
}
