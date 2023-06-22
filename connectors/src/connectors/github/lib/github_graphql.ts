import * as t from "io-ts";

export const ErrorPayloadSchema = t.type({
  errors: t.array(t.unknown),
});
export type ErrorPayload = t.TypeOf<typeof ErrorPayloadSchema>;

const PageInfoSchema = t.type({
  endCursor: t.union([t.string, t.null]),
  hasNextPage: t.boolean,
});

const DiscussionNodeSchema = t.type({
  title: t.string,
  id: t.string,
  number: t.number,
  url: t.string,
  bodyText: t.string,
  createdAt: t.string,
  updatedAt: t.string,
  author: t.type({
    login: t.string,
  }),
});

export type DiscussionNode = t.TypeOf<typeof DiscussionNodeSchema>;

const DiscussionCommentNodeSchema = t.type({
  id: t.string,
  isAnswer: t.boolean,
  bodyText: t.string,
  createdAt: t.string,
  updatedAt: t.string,
  author: t.type({
    login: t.string,
  }),
});

export type DiscussionCommentNode = t.TypeOf<
  typeof DiscussionCommentNodeSchema
>;

export const GetRepoDiscussionsPayloadSchema = t.type({
  repository: t.type({
    discussions: t.type({
      pageInfo: PageInfoSchema,
      edges: t.array(t.type({ node: DiscussionNodeSchema })),
    }),
  }),
});

export type GetRepoDiscussionsPayload = t.TypeOf<
  typeof GetRepoDiscussionsPayloadSchema
>;

export const GetDiscussionCommentsPayloadSchema = t.type({
  repository: t.type({
    discussion: t.type({
      comments: t.type({
        pageInfo: PageInfoSchema,
        edges: t.array(t.type({ node: DiscussionCommentNodeSchema })),
      }),
    }),
  }),
});

export type GetDiscussionCommentsPayload = t.TypeOf<
  typeof GetDiscussionCommentsPayloadSchema
>;

export const GetDiscussionCommentRepliesPayloadSchema = t.type({
  node: t.type({
    replies: t.type({
      pageInfo: PageInfoSchema,
      edges: t.array(t.type({ node: DiscussionCommentNodeSchema })),
    }),
  }),
});

export type GetDiscussionCommentRepliesPayload = t.TypeOf<
  typeof GetDiscussionCommentRepliesPayloadSchema
>;

export const GetDiscussionPayloadSchema = t.type({
  repository: t.type({
    discussion: DiscussionNodeSchema,
  }),
});

export type GetDiscussionPayload = t.TypeOf<typeof GetDiscussionPayloadSchema>;
