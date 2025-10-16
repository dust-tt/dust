import {
  Button,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  ExternalLinkIcon,
  GithubLogo,
  Label,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useGithubRepositories } from "@app/hooks/useGithubRepositories";
import { useSendNotification } from "@app/hooks/useNotification";
import type { LightWorkspaceType, OAuthConnectionType } from "@app/types";
import { setupOAuthConnection } from "@app/types";

type CreateWebhookGithubConnectionProps = {
  owner: LightWorkspaceType;
  onGithubDataChange?: (
    data: {
      connectionId: string;
      repository: string;
    } | null
  ) => void;
};

export function CreateWebhookGithubConnection({
  owner,
  onGithubDataChange,
}: CreateWebhookGithubConnectionProps) {
  const sendNotification = useSendNotification();
  const [githubConnection, setGithubConnection] =
    useState<OAuthConnectionType | null>(null);
  const [isConnectingGithub, setIsConnectingGithub] = useState(false);
  const { githubRepositories, isFetchingRepos, fetchGithubRepositories } =
    useGithubRepositories(owner);
  const [selectedRepository, setSelectedRepository] = useState<string | null>(
    null
  );
  const [repoSearchQuery, setRepoSearchQuery] = useState("");

  const filteredRepositories = githubRepositories.filter((repo) =>
    repo.full_name.toLowerCase().includes(repoSearchQuery.toLowerCase())
  );

  // Notify parent component when GitHub data changes
  useEffect(() => {
    if (githubConnection && selectedRepository && onGithubDataChange) {
      onGithubDataChange({
        connectionId: githubConnection.connection_id,
        repository: selectedRepository,
      });
    } else if (onGithubDataChange) {
      onGithubDataChange(null);
    }
  }, [githubConnection, selectedRepository, onGithubDataChange]);

  const handleConnectGithub = async () => {
    if (!owner) {
      return;
    }

    setIsConnectingGithub(true);
    try {
      const connectionRes = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider: "github",
        useCase: "webhooks",
        extraConfig: {},
      });

      if (connectionRes.isErr()) {
        sendNotification({
          type: "error",
          title: "Failed to connect to GitHub",
          description: connectionRes.error.message,
        });
      } else {
        setGithubConnection(connectionRes.value);
        sendNotification({
          type: "success",
          title: "Connected to GitHub",
          description: "Fetching your repositories...",
        });
        // Fetch repositories after successful connection
        await fetchGithubRepositories(connectionRes.value.connection_id);
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect to GitHub",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsConnectingGithub(false);
    }
  };

  return (
    <div className="flex flex-col space-y-2">
      <Label>GitHub Connection</Label>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Connect your GitHub account to access your repositories.
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant={githubConnection ? "outline" : "primary"}
          label={githubConnection ? "Connected to GitHub" : "Connect to GitHub"}
          icon={GithubLogo}
          onClick={handleConnectGithub}
          disabled={isConnectingGithub || !!githubConnection}
        />
        {githubConnection && (
          <a
            href={`https://github.com/settings/connections/applications/${process.env.NEXT_PUBLIC_OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-action-500 hover:text-action-600 dark:text-action-400 dark:hover:text-action-300 inline-flex items-center gap-1 text-sm"
          >
            Edit connection
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        )}
        {isConnectingGithub && <Spinner size="sm" />}
      </div>
      {githubConnection && (
        <div className="mt-3">
          <Label>
            Select Repository <span className="text-warning">*</span>
          </Label>
          {isFetchingRepos ? (
            <div className="flex items-center gap-2 py-2">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">
                Loading repositories...
              </span>
            </div>
          ) : githubRepositories.length > 0 ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    label={
                      selectedRepository
                        ? selectedRepository
                        : "Select a repository..."
                    }
                    variant="outline"
                    icon={ChevronDownIcon}
                    className="mt-2 w-full justify-between"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80">
                  <DropdownMenuSearchbar
                    name="repository"
                    placeholder="Search repositories..."
                    value={repoSearchQuery}
                    onChange={setRepoSearchQuery}
                  />
                  <div className="max-h-64 overflow-y-auto">
                    {filteredRepositories.length > 0 ? (
                      filteredRepositories.map((repo) => (
                        <DropdownMenuItem
                          key={repo.id}
                          onClick={() => {
                            setSelectedRepository(repo.full_name);
                            setRepoSearchQuery("");
                          }}
                        >
                          {repo.full_name}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                        No repositories found
                      </div>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              {!selectedRepository && (
                <p className="dark:text-warning-night mt-1 text-xs text-warning">
                  Please select a repository to create the webhook
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No repositories found
            </p>
          )}
        </div>
      )}
    </div>
  );
}
