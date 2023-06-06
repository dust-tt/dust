export type GithubWebhookPayload = {
  action: string;
  installation: {
    id: number;
  };
};

export function isGithubWebhookPayload(
  payload: unknown
): payload is GithubWebhookPayload {
  return (
    !!(payload as GithubWebhookPayload).action &&
    typeof (payload as GithubWebhookPayload).action === "string" &&
    !!(payload as GithubWebhookPayload).installation &&
    typeof (payload as GithubWebhookPayload).installation.id === "number"
  );
}

export type LightRepoType = {
  id: number;
  name: string;
};

export type WithInstallationAccountType = {
  installation: {
    id: number;
    account: {
      login: string;
    };
  };
};

export function isWithInstallationAccountType(
  payload: unknown
): payload is WithInstallationAccountType {
  return (
    !!(payload as WithInstallationAccountType).installation &&
    typeof (payload as WithInstallationAccountType).installation.id ===
      "number" &&
    !!(payload as WithInstallationAccountType).installation.account &&
    typeof (payload as WithInstallationAccountType).installation.account
      .login === "string"
  );
}

export type RepositoriesAddedPayload = {
  action: "added";
  repositories_added: LightRepoType[];
} & WithInstallationAccountType;

export function isRepositoriesAddedPayload(
  payload: unknown
): payload is RepositoriesAddedPayload {
  return (
    !!(payload as RepositoriesAddedPayload).repositories_added &&
    (payload as RepositoriesAddedPayload).action === "added" &&
    isWithInstallationAccountType(payload)
  );
}

export type RepositoriesRemovedPayload = {
  action: "removed";
  repositories_removed: LightRepoType[];
} & WithInstallationAccountType;

export function isRepositoriesRemovedPayload(
  payload: unknown
): payload is RepositoriesRemovedPayload {
  return (
    !!(payload as RepositoriesRemovedPayload).repositories_removed &&
    (payload as RepositoriesRemovedPayload).action === "removed" &&
    isWithInstallationAccountType(payload)
  );
}

export type WithLightIssueType = {
  issue: {
    id: number;
    number: number;
  };
};

export function isWithLightIssueType(
  payload: unknown
): payload is WithLightIssueType {
  return (
    !!(payload as WithLightIssueType).issue &&
    typeof (payload as WithLightIssueType).issue.id === "number" &&
    typeof (payload as WithLightIssueType).issue.number === "number"
  );
}

export type WithLightOrganizationType = {
  organization: {
    login: string;
  };
};

export function isWithLightOrganizationType(
  payload: unknown
): payload is WithLightOrganizationType {
  return (
    !!(payload as WithLightOrganizationType).organization &&
    typeof (payload as WithLightOrganizationType).organization.login ===
      "string"
  );
}

export type WithLightRepositoryType = {
  repository: {
    id: number;
    name: string;
  };
};

export function isWithLightRepositoryType(
  payload: unknown
): payload is WithLightRepositoryType {
  return (
    !!(payload as WithLightRepositoryType).repository &&
    typeof (payload as WithLightRepositoryType).repository.id === "number" &&
    typeof (payload as WithLightRepositoryType).repository.name === "string"
  );
}

export const issuePayloadActions = ["opened", "edited", "deleted"] as const;

export type IssuePayload = {
  action: (typeof issuePayloadActions)[number];
} & WithLightIssueType &
  WithLightOrganizationType &
  WithLightRepositoryType;

export function isIssuePayload(payload: unknown): payload is IssuePayload {
  return (
    !!(payload as IssuePayload).issue &&
    issuePayloadActions.includes((payload as IssuePayload).action) &&
    isWithLightIssueType(payload) &&
    isWithLightOrganizationType(payload) &&
    isWithLightRepositoryType(payload)
  );
}

export const commentPayloadActions = ["created", "edited", "deleted"] as const;

export type CommentPayload = {
  action: (typeof commentPayloadActions)[number];
} & WithLightIssueType &
  WithLightOrganizationType &
  WithLightRepositoryType;

export function isCommentPayload(payload: unknown): payload is CommentPayload {
  return (
    commentPayloadActions.includes((payload as CommentPayload).action) &&
    isWithLightIssueType(payload) &&
    isWithLightOrganizationType(payload) &&
    isWithLightRepositoryType(payload)
  );
}

export const pullRequestPayloadActions = ["opened", "edited"] as const;

export type PullRequestPayload = {
  action: (typeof pullRequestPayloadActions)[number];
  pull_request: { id: number; number: number };
} & WithLightOrganizationType &
  WithLightRepositoryType;

export function isPullRequestPayload(
  payload: unknown
): payload is PullRequestPayload {
  return (
    pullRequestPayloadActions.includes(
      (payload as PullRequestPayload).action
    ) &&
    !!(payload as PullRequestPayload).pull_request &&
    typeof (payload as PullRequestPayload).pull_request.id === "number" &&
    typeof (payload as PullRequestPayload).pull_request.number === "number" &&
    isWithLightOrganizationType(payload) &&
    isWithLightRepositoryType(payload)
  );
}
