export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  DateTime: { input: any; output: any };
  HTML: { input: any; output: any };
  URI: { input: any; output: any };
};

export type Actor = {
  __typename?: "Actor";
  login: Scalars["String"]["output"];
};

export type Issue = {
  __typename?: "Issue";
  author?: Maybe<Actor>;
  body?: Maybe<Scalars["String"]["output"]>;
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  labels?: Maybe<LabelConnection>;
  number: Scalars["Int"]["output"];
  state: Scalars["String"]["output"];
  title: Scalars["String"]["output"];
  updatedAt: Scalars["DateTime"]["output"];
  url: Scalars["URI"]["output"];
};

export type IssueLabelsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
};

export type IssueConnection = {
  __typename?: "IssueConnection";
  nodes?: Maybe<Array<Maybe<Issue>>>;
  pageInfo: PageInfo;
};

export enum IssueState {
  Closed = "CLOSED",
  Open = "OPEN",
}

export type Label = {
  __typename?: "Label";
  name: Scalars["String"]["output"];
};

export type LabelConnection = {
  __typename?: "LabelConnection";
  nodes?: Maybe<Array<Maybe<Label>>>;
};

export type PageInfo = {
  __typename?: "PageInfo";
  endCursor?: Maybe<Scalars["String"]["output"]>;
  hasNextPage: Scalars["Boolean"]["output"];
};

export type Query = {
  __typename?: "Query";
  repository?: Maybe<Repository>;
};

export type QueryRepositoryArgs = {
  name: Scalars["String"]["input"];
  owner: Scalars["String"]["input"];
};

export type Repository = {
  __typename?: "Repository";
  issues: IssueConnection;
};

export type RepositoryIssuesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  states?: InputMaybe<Array<IssueState>>;
};

export type GetIssuesQueryVariables = Exact<{
  owner: Scalars["String"]["input"];
  repo: Scalars["String"]["input"];
  cursor?: InputMaybe<Scalars["String"]["input"]>;
  perPage: Scalars["Int"]["input"];
}>;

export type GetIssuesQuery = {
  __typename?: "Query";
  repository?: {
    __typename?: "Repository";
    issues: {
      __typename?: "IssueConnection";
      pageInfo: {
        __typename?: "PageInfo";
        endCursor?: string | null;
        hasNextPage: boolean;
      };
      nodes?: Array<{
        __typename: "Issue";
        id: string;
        number: number;
        title: string;
        url: any;
        createdAt: any;
        updatedAt: any;
        body?: string | null;
        state: string;
        author?: { __typename?: "Actor"; login: string } | null;
        labels?: {
          __typename?: "LabelConnection";
          nodes?: Array<{ __typename?: "Label"; name: string } | null> | null;
        } | null;
      } | null> | null;
    };
  } | null;
};
