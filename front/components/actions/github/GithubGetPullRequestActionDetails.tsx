import { GithubIcon } from "@dust-tt/sparkle";
import type { GithubGetPullRequestActionType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

export function GithubGetPullRequestActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<GithubGetPullRequestActionType>) {
  const { owner, repo, pullNumber } = action.params;
  return (
    <ActionDetailsWrapper
      actionName="Retrieve pull request"
      defaultOpen={defaultOpen}
      visual={GithubIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <p className="text-sm font-normal text-muted-foreground">
          {`https://github.com/${owner}/${repo}/pull/${pullNumber}`}
        </p>
      </div>
    </ActionDetailsWrapper>
  );
}
