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

function UserMentionBlock({ userName }: { userName: string }) {
  return (
    <span className="inline-block font-medium text-highlight-500">
      @{userName}
    </span>
  );
}

export function mentionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "mention" && node.children[0]) {
        const data = node.data || (node.data = {});
        data.hName = "mention";

        // Handle both agent mentions (sId) and user mentions (userId)
        if (node.attributes.sId) {
          data.hProperties = {
            type: "agent",
            agentSId: node.attributes.sId,
            agentName: node.children[0].value,
          };
        } else if (node.attributes.userId) {
          data.hProperties = {
            type: "user",
            userId: node.attributes.userId,
            userName: node.children[0].value,
          };
        }
      }
    });
  };
}

export function getMentionPlugin(owner: WorkspaceType) {
  const MentionPlugin = ({
    type,
    agentName,
    agentSId,
    userName,
    userId,
  }: {
    type?: string;
    agentName?: string;
    agentSId?: string;
    userName?: string;
    userId?: string;
  }) => {
    if (type === "user" && userName) {
      return <UserMentionBlock userName={userName} />;
    }

    if (type === "agent" && agentName && agentSId) {
      return (
        <AgentMentionBlock
          owner={owner}
          agentName={agentName}
          agentSId={agentSId}
        />
      );
    }

    // Fallback for legacy mentions without type (assume agent)
    if (agentName && agentSId) {
      return (
        <AgentMentionBlock
          owner={owner}
          agentName={agentName}
          agentSId={agentSId}
        />
      );
    }

    return null;
  };

  return MentionPlugin;
}
