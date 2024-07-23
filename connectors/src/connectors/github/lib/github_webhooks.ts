import { isRight } from "fp-ts/lib/Either";
import * as t from "io-ts";

export const GithubWebhookPayloadSchema = t.type({
  action: t.string,
  installation: t.type({
    id: t.number,
  }),
});

const InstallationSchema = t.type({
  id: t.number,
  account: t.type({
    login: t.string,
  }),
});

const RepositorySchema = t.type({
  id: t.number,
  name: t.string,
});

const RepositoriesAddedPayloadSchema = t.type({
  action: t.literal("added"),
  repositories_added: t.array(RepositorySchema),
  installation: InstallationSchema,
});
type RepositoriesAddedPayload = t.TypeOf<typeof RepositoriesAddedPayloadSchema>;
export function isRepositoriesAddedPayload(
  payload: unknown
): payload is RepositoriesAddedPayload {
  const validation = RepositoriesAddedPayloadSchema.decode(payload);
  return isRight(validation);
}

const RepositoriesRemovedPayloadSchema = t.type({
  action: t.literal("removed"),
  repositories_removed: t.array(RepositorySchema),
  installation: InstallationSchema,
});
type RepositoriesRemovedPayload = t.TypeOf<
  typeof RepositoriesRemovedPayloadSchema
>;
export function isRepositoriesRemovedPayload(
  payload: unknown
): payload is RepositoriesRemovedPayload {
  const validation = RepositoriesRemovedPayloadSchema.decode(payload);
  return isRight(validation);
}

const IssueSchema = t.type({
  id: t.number,
  number: t.number,
});

const OrganizationSchema = t.type({
  login: t.string,
});

const UserSchema = t.type({
  login: t.string,
});

const IssuePayloadSchema = t.intersection([
  t.type({
    action: t.union([
      t.literal("opened"),
      t.literal("edited"),
      t.literal("deleted"),
    ]),
    issue: IssueSchema,
    repository: RepositorySchema,
  }),
  t.union([
    t.type({
      organization: OrganizationSchema,
    }),
    t.type({
      user: UserSchema,
    }),
  ]),
]);
type IssuePayload = t.TypeOf<typeof IssuePayloadSchema>;
export function isIssuePayload(payload: unknown): payload is IssuePayload {
  const validation = IssuePayloadSchema.decode(payload);
  return isRight(validation);
}

const CommentPayloadSchema = t.intersection([
  t.type({
    action: t.union([
      t.literal("created"),
      t.literal("edited"),
      t.literal("deleted"),
    ]),
    issue: IssueSchema,
    repository: RepositorySchema,
  }),
  t.union([
    t.type({
      organization: OrganizationSchema,
    }),
    t.type({
      user: UserSchema,
    }),
  ]),
]);
type CommentPayload = t.TypeOf<typeof CommentPayloadSchema>;
export function isCommentPayload(payload: unknown): payload is CommentPayload {
  const validation = CommentPayloadSchema.decode(payload);
  return isRight(validation);
}

const PullRequestSchema = t.type({
  id: t.number,
  number: t.number,
  merged: t.boolean,
});

const PullRequestPayloadSchema = t.intersection([
  t.type({
    action: t.union([
      t.literal("opened"),
      t.literal("edited"),
      t.literal("closed"),
    ]),
    pull_request: PullRequestSchema,
    repository: RepositorySchema,
  }),
  t.union([
    t.type({
      organization: OrganizationSchema,
    }),
    t.type({
      user: UserSchema,
    }),
  ]),
]);

type PullRequestPayload = t.TypeOf<typeof PullRequestPayloadSchema>;
export function isPullRequestPayload(
  payload: unknown
): payload is PullRequestPayload {
  const validation = PullRequestPayloadSchema.decode(payload);
  return isRight(validation);
}

const DiscussionSchema = t.type({
  number: t.number,
});

const DiscussionPayloadSchema = t.intersection([
  t.type({
    action: t.union([
      t.literal("created"),
      t.literal("edited"),
      t.literal("deleted"),
    ]),
    discussion: DiscussionSchema,
    repository: RepositorySchema,
  }),
  t.union([
    t.type({
      organization: OrganizationSchema,
    }),
    t.type({
      user: UserSchema,
    }),
  ]),
]);
type DiscussionPayload = t.TypeOf<typeof DiscussionPayloadSchema>;
export function isDiscussionPayload(
  payload: unknown
): payload is DiscussionPayload {
  const validation = DiscussionPayloadSchema.decode(payload);
  return isRight(validation);
}
