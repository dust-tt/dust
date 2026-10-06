import type { DocumentCommentAvatarSize } from "@app/components/editor/document";
import type { DfmAuthor } from "@app/lib/markdown/dfm";
import {
  useMemberDetails,
  useUnifiedAgentConfigurations,
} from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar } from "@dust-tt/sparkle";

interface AuthorAvatarProps {
  owner: LightWorkspaceType;
  author: DfmAuthor;
  size: DocumentCommentAvatarSize;
}

const UserAuthorAvatar = ({ owner, author, size }: AuthorAvatarProps) => {
  const { userDetails, isMembersLoading } = useMemberDetails({
    workspaceId: owner.sId,
    userIds: [author.id],
    shouldRetryOnError: false,
  });

  return (
    <Avatar
      size={size}
      isRounded
      name={author.name}
      visual={userDetails?.image ?? undefined}
      busy={isMembersLoading}
    />
  );
};

// One index per fetched agent list, shared by every avatar rendering from it.
const agentPictureIndexes = new WeakMap<
  LightAgentConfigurationType[],
  Map<string, string>
>();

const agentPictureUrl = (
  agents: LightAgentConfigurationType[],
  agentId: string
) => {
  let index = agentPictureIndexes.get(agents);
  if (!index) {
    index = new Map(agents.map(({ sId, pictureUrl }) => [sId, pictureUrl]));
    agentPictureIndexes.set(agents, index);
  }
  return index.get(agentId);
};

const AgentAuthorAvatar = ({ owner, author, size }: AuthorAvatarProps) => {
  const { agentConfigurations, isLoading } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });
  const pictureUrl = agentPictureUrl(agentConfigurations, author.id);

  return (
    <Avatar
      size={size}
      name={author.name}
      visual={pictureUrl}
      busy={isLoading && pictureUrl === undefined}
    />
  );
};

/**
 * @cc [owner:tdraier,label:react] comment-author-avatar
 * A user author MUST show their workspace profile picture and an agent author the picture of
 * an agent the viewer can list. An author whose picture cannot be resolved, such as a former
 * member or an agent hidden from the viewer, MUST show their initials from the comment's name.
 * While the picture is still loading, the avatar MUST show as busy. A failed member lookup MUST
 * NOT be retried.
 */
export const CommentAuthorAvatar = (props: AuthorAvatarProps) =>
  props.author.kind === "user" ? (
    <UserAuthorAvatar {...props} />
  ) : (
    <AgentAuthorAvatar {...props} />
  );
