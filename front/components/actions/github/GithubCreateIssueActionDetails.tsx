import { GithubIcon } from "@dust-tt/sparkle";
import type { GithubCreateIssueActionType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

export function GithubCreateIssueActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<GithubCreateIssueActionType>) {
  const { owner, repo } = action.params;
  console.log(action);
  return (
    <ActionDetailsWrapper
      actionName="Create issue"
      defaultOpen={defaultOpen}
      visual={GithubIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <p className="text-sm font-normal text-muted-foreground">
          <a
            href={`https://github.com/${owner}/${repo}/issues/${action.issueNumber}`}
            target="_blank"
          >
            {`https://github.com/${owner}/${repo}/issues/${action.issueNumber}`}
          </a>
        </p>
      </div>
    </ActionDetailsWrapper>
  );
}
