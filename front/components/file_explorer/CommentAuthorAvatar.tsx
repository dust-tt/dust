import type { DocumentCommentAvatarSize } from "@app/components/editor/document";
import type { DfmAuthor } from "@app/lib/markdown/dfm";
import {
  useMemberDetails,
  useUnifiedAgentConfigurations,
} from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar } from "@dust-tt/sparkle";

interface AuthorAvatarProps {
  owner: LightWorkspaceType;
  author: DfmAuthor;
  size: DocumentCommentAvatarSize;
}

const UserAuthorAvatar = ({ owner, author, size }: AuthorAvatarProps) => {
  const { userDetails } = useMemberDetails({
    workspaceId: owner.sId,
    userIds: [author.id],
  });

  return (
    <Avatar
      size={size}
      isRounded
      name={author.name}
      visual={userDetails?.image ?? undefined}
    />
  );
};

const AgentAuthorAvatar = ({ owner, author, size }: AuthorAvatarProps) => {
  const { agentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });
  const agent = agentConfigurations.find(({ sId }) => sId === author.id);

  return <Avatar size={size} name={author.name} visual={agent?.pictureUrl} />;
};

/**
 * @cc [owner:tdraier,label:react] comment-author-avatar
 * A user author MUST show their workspace profile picture and an agent author the picture of
 * an agent the viewer can list. An author whose picture cannot be resolved, such as a former
 * member or an agent hidden from the viewer, MUST show their initials from the comment's name.
 */
export const CommentAuthorAvatar = (props: AuthorAvatarProps) =>
  props.author.kind === "user" ? (
    <UserAuthorAvatar {...props} />
  ) : (
    <AgentAuthorAvatar {...props} />
  );
