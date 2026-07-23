import type { GitHubConnectionStatus } from "@app/lib/skill_detection";
import { useDisconnectWorkspaceGitHub } from "@app/lib/swr/github_connection";
import type { LightWorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  Avatar,
  Button,
  Chip,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GithubMonoLogo,
  Tooltip,
} from "@dust-tt/sparkle";

interface GitHubConnectionRowProps {
  owner: LightWorkspaceType;
  connection: GitHubConnectionStatus;
  onDisconnected: () => void;
}

export function GitHubConnectionRow({
  owner,
  connection,
  onDisconnected,
}: GitHubConnectionRowProps) {
  const { disconnectGitHub, isDisconnectingGitHub } =
    useDisconnectWorkspaceGitHub({ owner });

  const handleDisconnect = async () => {
    const disconnected = await disconnectGitHub();
    if (disconnected) {
      onDisconnected();
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3">
      <Avatar icon={GithubMonoLogo} size="sm" />
      <div className="flex grow flex-col">
        <span className="heading-sm text-foreground">GitHub</span>
        <span className="text-sm text-muted-foreground">
          Access Repository - Shared connection
        </span>
      </div>
      <Chip size="xs" color="success" label="Connected" />
      {connection.connectedBy && (
        <Tooltip
          label={connection.connectedBy.fullName}
          trigger={
            <Avatar
              size="xxs"
              name={connection.connectedBy.fullName}
              visual={connection.connectedBy.imageUrl ?? undefined}
            />
          }
        />
      )}
      {isAdmin(owner) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isDisconnectingGitHub}>
            <Button variant="ghost" size="sm" icon={DotsHorizontal} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="Disconnect"
              onClick={() => {
                void handleDisconnect();
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
