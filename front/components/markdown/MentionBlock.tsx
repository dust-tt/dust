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
import { setQueryParam } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";

// Not exported, the one exported is getMentionPlugin since we need to pass the owner.
function MentionBlock({
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
    useURLSheet("assistantDetails");

  const handleStartConversation = async () => {
    await router.push(`/w/${owner.sId}/agent/new?agent=${agentSId}`);
  };

  const handleSeeDetails = () => {
    onOpenChangeAssistantModal(true);
    setQueryParam(router, "assistantDetails", agentSId);
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

export function mentionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
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

export function getMentionPlugin(owner: WorkspaceType) {
  const MentionPlugin = ({
    agentName,
    agentSId,
  }: {
    agentName: string;
    agentSId: string;
  }) => {
    return (
      <MentionBlock owner={owner} agentName={agentName} agentSId={agentSId} />
    );
  };

  return MentionPlugin;
}
