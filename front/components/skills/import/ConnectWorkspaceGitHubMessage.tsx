import { useConnectWorkspaceGitHub } from "@app/lib/swr/github_connection";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  CloudArrowLeftRight,
  ContentMessage,
  GithubLogo,
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
      icon={GithubLogo}
      title="Connect GitHub to import from private repositories"
      action={
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
      }
    >
      For private repos, connect a GitHub account that has access. All workspace
      members will share this connection.
    </ContentMessage>
  );
}
