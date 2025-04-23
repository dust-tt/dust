import * as t from "io-ts";

const UserCodec = t.type({
  displayName: t.string,
  emailAddress: t.union([t.string, t.null]),
});

const ProjectCodec = t.type({
  key: t.string,
  name: t.string,
});

const IssueTypeCodec = t.type({
  name: t.string,
});

const StatusCodec = t.type({
  name: t.string,
});

const PriorityCodec = t.type({
  name: t.string,
});

const CommentContentCodec = t.type({
  content: t.array(
    t.type({
      content: t.array(
        t.type({
          text: t.string,
        })
      ),
    })
  ),
});

const CommentCodec = t.type({
  author: UserCodec,
  created: t.string,
  body: CommentContentCodec,
});

const AttachmentCodec = t.type({
  filename: t.string,
  content: t.string,
});

const IssueCodec = t.type({
  id: t.string,
  key: t.string,
  self: t.string,
  fields: t.type({
    summary: t.string,
    description: t.union([CommentContentCodec, t.null]),
    issuetype: IssueTypeCodec,
    status: StatusCodec,
    priority: PriorityCodec,
    assignee: t.union([UserCodec, t.null]),
    reporter: UserCodec,
    project: ProjectCodec,
    created: t.string,
    updated: t.string,
    resolutiondate: t.union([t.string, t.null]),
    resolution: t.union([t.type({ name: t.string }), t.null]),
    labels: t.array(t.string),
    components: t.array(t.type({ name: t.string })),
    timeoriginalestimate: t.union([t.number, t.null]),
    timeestimate: t.union([t.number, t.null]),
    timespent: t.union([t.number, t.null]),
    votes: t.type({ votes: t.number }),
    watches: t.type({ watchCount: t.number }),
    fixVersions: t.array(t.type({ name: t.string })),
    versions: t.array(t.type({ name: t.string })),
    subtasks: t.array(
      t.type({
        key: t.string,
        fields: t.type({ summary: t.string }),
      })
    ),
    issuelinks: t.array(
      t.type({
        type: t.type({
          name: t.string,
          inward: t.string,
          outward: t.string,
        }),
        inwardIssue: t.union([
          t.type({
            key: t.string,
            fields: t.type({ summary: t.string }),
          }),
          t.undefined,
        ]),
        outwardIssue: t.union([
          t.type({
            key: t.string,
            fields: t.type({ summary: t.string }),
          }),
          t.undefined,
        ]),
      })
    ),
    attachment: t.array(AttachmentCodec),
    comment: t.type({
      comments: t.array(CommentCodec),
    }),
  }),
});

const JiraSearchResponseCodec = t.type({
  issues: t.array(IssueCodec),
  startAt: t.number,
  maxResults: t.number,
  total: t.number,
});

const JiraFilterCodec = t.type({
  jql: t.string,
});

export type User = t.TypeOf<typeof UserCodec>;
export type Project = t.TypeOf<typeof ProjectCodec>;
export type IssueType = t.TypeOf<typeof IssueTypeCodec>;
export type Status = t.TypeOf<typeof StatusCodec>;
export type Priority = t.TypeOf<typeof PriorityCodec>;
export type Comment = t.TypeOf<typeof CommentCodec>;
export type Attachment = t.TypeOf<typeof AttachmentCodec>;
export type Issue = t.TypeOf<typeof IssueCodec>;
export type JiraSearchResponse = t.TypeOf<typeof JiraSearchResponseCodec>;
export type JiraFilter = t.TypeOf<typeof JiraFilterCodec>;

export {
  AttachmentCodec,
  CommentCodec,
  IssueCodec,
  IssueTypeCodec,
  JiraFilterCodec,
  JiraSearchResponseCodec,
  PriorityCodec,
  ProjectCodec,
  StatusCodec,
  UserCodec,
};
