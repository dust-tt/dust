import type { MessageTemporaryState } from "@app/components/assistant/conversation/types";
import type {
  ContentFragmentsType,
  ContentFragmentType,
  FileContentFragmentType,
  RichMention,
  SupportedContentFragmentType,
  UserMessageType,
  UserType,
} from "@app/types";
import { toMentionType } from "@app/types";

export function createPlaceholderUserMessage({
  input,
  mentions,
  user,
  rank,
  contentFragments,
}: {
  input: string;
  mentions: RichMention[];
  user: UserType;
  rank: number;
  contentFragments?: ContentFragmentsType;
}): UserMessageType & { contentFragments: ContentFragmentType[] } {
  const createdAt = new Date().getTime();
  const { email, fullName, image, username } = user;

  return {
    id: -1,
    content: input,
    created: createdAt,
    mentions: mentions.map((mention) => toMentionType(mention)),
    richMentions: mentions.map((mention) => ({
      ...mention,
      status: "approved",
    })),
    user,
    visibility: "visible",
    type: "user_message",
    sId: `placeholder-user-message-${createdAt.toString()}`,
    version: 0,
    rank: rank,
    context: {
      email,
      fullName,
      profilePictureUrl: image,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      username,
      origin: "web",
    },
    contentFragments: [
      ...(contentFragments?.uploaded ?? []).map(
        (cf) =>
          ({
            type: "content_fragment" as const,
            contentFragmentType: "file" as const,
            fileId: cf.fileId,
            title: cf.title,
            snippet: null,
            generatedTables: [],
            textUrl: "",
            textBytes: null,
            id: Math.random(),
            sId: cf.fileId,
            created: Date.now(),
            visibility: "visible" as const,
            version: 0,
            rank,
            sourceUrl: null,
            contentType: cf.contentType,
            context: {
              username: user.username,
              fullName: user.fullName,
              email: user.email,
              profilePictureUrl: user.image,
            },
            contentFragmentId: "placeholder-content-fragment",
            contentFragmentVersion: "latest" as const,
            expiredReason: null,
            sourceProvider: null,
            sourceIcon: null,
          }) satisfies FileContentFragmentType
      ),
      ...(contentFragments?.contentNodes ?? []).map(
        (cf) =>
          ({
            type: "content_fragment" as const,
            contentFragmentType: "content_node" as const,

            contentType: cf.mimeType as SupportedContentFragmentType,

            title: cf.title,
            id: Math.random(),

            sId: cf.internalId,

            nodeId: cf.internalId,
            nodeDataSourceViewId: cf.dataSourceView.sId,
            nodeType: cf.type,
            contentNodeData: {
              nodeId: cf.internalId,
              nodeDataSourceViewId: cf.dataSourceView.sId,
              nodeType: cf.type,
              provider: cf.dataSourceView.dataSource.connectorProvider,
              spaceName: "myspace",
            },

            created: Date.now(),
            visibility: "visible" as const,
            version: 0,
            rank,
            sourceUrl: null,

            context: {
              username: user.username,
              fullName: user.fullName,
              email: user.email,
              profilePictureUrl: user.image,
            },
            contentFragmentId: "placeholder-content-fragment",
            contentFragmentVersion: "latest" as const,
            expiredReason: null,
          }) satisfies ContentFragmentType
      ),
    ],
  };
}

export function createPlaceholderAgentMessage({
  userMessage,
  mention,
  rank,
}: {
  userMessage: UserMessageType;
  mention: RichMention & { pictureUrl: string };
  rank: number;
}): MessageTemporaryState {
  const createdAt = new Date().getTime();
  return {
    sId: `placeholder-agent-message-${createdAt.toString()}`,
    rank: rank,
    type: "agent_message",
    version: 0,
    created: createdAt,
    completedTs: null,
    parentMessageId: userMessage.sId,
    parentAgentMessageId: null,
    visibility: "visible",
    status: "created",
    content: null,
    chainOfThought: null,
    error: null,
    configuration: {
      sId: mention.id,
      name: mention.label,
      pictureUrl: mention.pictureUrl ?? "",
      status: "active",
      canRead: true,
    },
    citations: {},
    generatedFiles: [],
    actions: [],
    richMentions: [],

    streaming: {
      agentState: "placeholder",
      isRetrying: false,
      lastUpdated: new Date(),
      actionProgress: new Map(),
      useFullChainOfThought: false,
    },
  };
}

