import { useConnectWorkspaceGitHub } from "@app/lib/swr/github_connection";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  CloudArrowLeftRight,
  ContentMessage,
  GithubLogo,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface ConnectWorkspaceGitHubMessageProps {
  owner: LightWorkspaceType;
  onConnected: () => void;
}

export function ConnectWorkspaceGitHubMessage({
  owner,
  onConnected,
}: ConnectWorkspaceGitHubMessageProps) {
  const { t } = useLingui();
  const { connectGitHub, isConnectingGitHub } = useConnectWorkspaceGitHub({
    owner,
  });

  const handleConnect = async () => {
    const connected = await connectGitHub();
    if (connected) {
      onConnected();
    }
  };

  return (
    <ContentMessage
      variant="primary"
      size="lg"
      icon={GithubLogo}
      title={t`Connect GitHub to import from private repositories`}
    >
      <div className="flex flex-col gap-3">
        <span>
          <Trans>
            Connect a GitHub account to grant access. All workspace members will
            share this connection.
          </Trans>
        </span>
        <div className="flex justify-end">
          <Button
            variant="highlight"
            size="sm"
            icon={CloudArrowLeftRight}
            label={t`Connect GitHub`}
            isLoading={isConnectingGitHub}
            disabled={isConnectingGitHub}
            onClick={() => {
              void handleConnect();
            }}
          />
        </div>
      </div>
    </ContentMessage>
  );
}
