import type { NotificationType } from "@dust-tt/sparkle";
import type * as t from "io-ts";

import type { EditorMention } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import type { MessageTemporaryState } from "@app/components/assistant/conversation/types";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { PostConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";
import type { PostMessagesResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages";
import type {
  ContentFragmentsType,
  ContentFragmentType,
  ConversationType,
  ConversationVisibility,
  FileContentFragmentType,
  InternalPostConversationsRequestBodySchema,
  MentionType,
  Result,
  SubmitMessageError,
  SupportedContentFragmentType,
  SupportedContentNodeContentType,
  UserMessageType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, isSupportedContentNodeFragmentContentType, Ok } from "@app/types";

export type ContentFragmentInput = {
  title: string;
  content: string;
  file: File;
};

export function createPlaceholderUserMessage({
  input,
  mentions,
  user,
  rank,
  contentFragments,
}: {
  input: string;
  mentions: EditorMention[];
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
    mentions: mentions.map((mention) => ({ configurationId: mention.id })),
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
  mention,
  rank,
}: {
  mention: EditorMention;
  rank: number;
}): MessageTemporaryState {
  const createdAt = new Date().getTime();
  return {
    message: {
      sId: `placeholder-agent-message-${createdAt.toString()}`,
      rank: rank,
      type: "agent_message",
      version: 0,
      created: createdAt,
      completedTs: null,
      parentMessageId: null,
      parentAgentMessageId: null,
      status: "created",
      content: null,
      chainOfThought: null,
      error: null,
      configuration: {
        sId: mention.id,
        name: mention.label,
        pictureUrl: "",
        status: "active",
        canRead: true,
        // TODO(2025-10-17 thomas): Remove.
        requestedGroupIds: [],
        requestedSpaceIds: [],
      },
      citations: {},
      generatedFiles: [],
      actions: [],
    },
    agentState: "placeholder",
    isRetrying: false,
    lastUpdated: new Date(),
    actionProgress: new Map(),
    useFullChainOfThought: false,
  };
}

export async function submitMessage({
  owner,
  user,
  conversationId,
  messageData,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
  messageData: {
    input: string;
    mentions: MentionType[];
    contentFragments: ContentFragmentsType;
    clientSideMCPServerIds?: string[];
  };
}): Promise<Result<PostMessagesResponseBody, SubmitMessageError>> {
  const { input, mentions, contentFragments, clientSideMCPServerIds } =
    messageData;

  // Create a new content fragment.
  if (
    contentFragments.uploaded.length > 0 ||
    contentFragments.contentNodes.length > 0
  ) {
    const contentFragmentsRes = await Promise.all([
      ...contentFragments.uploaded.map((contentFragment) => {
        return fetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/content_fragment`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: contentFragment.title,
              fileId: contentFragment.fileId,
              context: {
                timezone:
                  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                profilePictureUrl: user.image,
              },
            }),
          }
        );
      }),
      ...contentFragments.contentNodes.map((contentFragment) => {
        return fetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/content_fragment`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: contentFragment.title,
              nodeId: contentFragment.internalId,
              nodeDataSourceViewId: contentFragment.dataSourceView.sId,
              context: {
                timezone:
                  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                profilePictureUrl: user.image,
              },
            }),
          }
        );
      }),
    ]);

    for (const mcfRes of contentFragmentsRes) {
      if (!mcfRes.ok) {
        const data = await mcfRes.json();
        console.error("Error creating content fragment", data);
        return new Err({
          type: "attachment_upload_error",
          title: "Error uploading file.",
          message: data.error.message || "Please try again or contact us.",
        });
      }
    }
  }

  // Create a new user message.
  const mRes = await fetch(
    `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: input,
        context: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          profilePictureUrl: user.image,
          clientSideMCPServerIds,
        },
        mentions,
      }),
    }
  );

  if (!mRes.ok) {
    if (mRes.status === 413) {
      return new Err({
        type: "content_too_large",
        title: "Your message is too long to be sent.",
        message: "Please try again with a shorter message.",
      });
    }
    const data = await mRes.json();
    return new Err({
      type:
        data.error.type === "plan_message_limit_exceeded"
          ? "plan_limit_reached_error"
          : "message_send_error",
      title: "Your message could not be sent.",
      message: data.error.message || "Please try again or contact us.",
    });
  }

  return new Ok(await mRes.json());
}

export async function deleteConversation({
  workspaceId,
  conversationId,
  sendNotification,
}: {
  workspaceId: string;
  conversationId: string;
  sendNotification: (notification: NotificationType) => void;
}) {
  const res = await fetch(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}`,
    {
      method: "DELETE",
    }
  );

  if (!res.ok) {
    const errorData = await getErrorFromResponse(res);

    sendNotification({
      title: "Error deleting conversation.",
      description: errorData.message,
      type: "error",
    });
    return false;
  }
  return true;
}

export async function createConversationWithMessage({
  owner,
  user,
  messageData,
  visibility = "unlisted",
  title,
}: {
  owner: WorkspaceType;
  user: UserType;
  messageData: {
    input: string;
    mentions: MentionType[];
    contentFragments: ContentFragmentsType;
    clientSideMCPServerIds?: string[];
    selectedMCPServerViewIds?: string[];
  };
  visibility?: ConversationVisibility;
  title?: string;
}): Promise<Result<ConversationType, SubmitMessageError>> {
  const {
    input,
    mentions,
    contentFragments,
    clientSideMCPServerIds,
    selectedMCPServerViewIds,
  } = messageData;

  const body: t.TypeOf<typeof InternalPostConversationsRequestBodySchema> = {
    title: title ?? null,
    visibility,
    message: {
      content: input,
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        profilePictureUrl: user.image,
        clientSideMCPServerIds,
        selectedMCPServerViewIds,
      },
      mentions,
    },
    contentFragments: [
      ...contentFragments.uploaded.map((cf) => ({
        title: cf.title,

        context: {
          profilePictureUrl: user.image,
        },
        fileId: cf.fileId,
      })),
      ...contentFragments.contentNodes.map((cf) => {
        const contentType = isSupportedContentNodeFragmentContentType(
          cf.mimeType
        )
          ? (cf.mimeType as SupportedContentNodeContentType)
          : null;
        if (!contentType) {
          throw new Error(
            `Unsupported content node fragment mime type: ${cf.mimeType}`
          );
        }

        return {
          title: cf.title,
          context: {
            profilePictureUrl: user.image,
          },
          nodeId: cf.internalId,
          nodeDataSourceViewId: cf.dataSourceView.sId,
        };
      }),
    ],
  };

  // Create new conversation and post the initial message at the same time.
  const cRes = await fetch(`/api/w/${owner.sId}/assistant/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!cRes.ok) {
    const data = await cRes.json();
    return new Err({
      type:
        data.error.type === "plan_message_limit_exceeded"
          ? "plan_limit_reached_error"
          : "message_send_error",
      title: "Your message could not be sent.",
      message: data.error.message || "Please try again or contact us.",
    });
  }

  const conversationData = (await cRes.json()) as PostConversationsResponseBody;

  return new Ok(conversationData.conversation);
}
