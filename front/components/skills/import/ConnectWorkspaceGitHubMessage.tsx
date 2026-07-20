import { useConnectWorkspaceGitHub } from "@app/lib/swr/github_connection";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  CloudArrowLeftRight,
  ContentMessage,
  GithubMonoLogo,
} from "@dust-tt/sparkle";

interface ConnectWorkspaceGitHubMessageProps {
  owner: LightWorkspaceType;
  onConnected: () => void;
}

export function ConnectWorkspaceGitHubMessage({
  owner,
  onConnected,
}: ConnectWorkspaceGitHubMessageProps) {
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
      icon={GithubMonoLogo}
      title="Connect GitHub to import from private repositories"
    >
      <div className="flex flex-col gap-3">
        <span>
          Connect a GitHub account to grant access. All workspace members will
          share this connection.
        </span>
        <div className="flex justify-end">
          <Button
            variant="highlight"
            size="sm"
            icon={CloudArrowLeftRight}
            label="Connect GitHub"
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
