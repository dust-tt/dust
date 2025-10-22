import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  ExternalLinkIcon,
  GithubLogo,
  Label,
  PlusIcon,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { GithubAdditionalData } from "@app/lib/triggers/services/github_service_types";
import { GithubAdditionalDataSchema } from "@app/lib/triggers/services/github_service_types";
import type { LightWorkspaceType, OAuthConnectionType } from "@app/types";
import { setupOAuthConnection } from "@app/types";

type CreateWebhookGithubConnectionProps = {
  owner: LightWorkspaceType;
  serviceData: Record<string, unknown> | null;
  isFetchingServiceData: boolean;
  onFetchServiceData: (connectionId: string) => Promise<void>;
  onGithubDataChange?: (
    data: {
      connectionId: string;
      repositories: string[];
      organizations: string[];
    } | null
  ) => void;
  onReadyToSubmitChange?: (isReady: boolean) => void;
};

function isGithubAdditionalData(
  data: Record<string, unknown> | null
): data is GithubAdditionalData {
  if (!data) {
    return false;
  }

  const result = GithubAdditionalDataSchema.safeParse(data);
  return result.success;
}

export function CreateWebhookGithubConnection({
  owner,
  serviceData,
  isFetchingServiceData,
  onFetchServiceData,
  onGithubDataChange,
  onReadyToSubmitChange,
}: CreateWebhookGithubConnectionProps) {
  const sendNotification = useSendNotification();
  const [githubConnection, setGithubConnection] =
    useState<OAuthConnectionType | null>(null);
  const [isConnectingGithub, setIsConnectingGithub] = useState(false);
  const [selectedRepositories, setSelectedRepositories] = useState<string[]>(
    []
  );
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>(
    []
  );
  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  const githubData = isGithubAdditionalData(serviceData) ? serviceData : null;
  const githubRepositories = githubData?.repositories ?? [];
  const githubOrganizations = githubData?.organizations ?? [];
  const [orgSearchQuery, setOrgSearchQuery] = useState("");
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);

  const filteredRepositories = githubRepositories.filter((repo) =>
    repo.full_name.toLowerCase().includes(repoSearchQuery.toLowerCase())
  );

  const filteredOrganizations = githubOrganizations.filter((org) =>
    org.login.toLowerCase().includes(orgSearchQuery.toLowerCase())
  );

  // Notify parent component when GitHub data changes
  useEffect(() => {
    const isReady = !!(
      githubConnection &&
      (selectedRepositories.length > 0 || selectedOrganizations.length > 0)
    );

    if (isReady && onGithubDataChange) {
      onGithubDataChange({
        connectionId: githubConnection.connection_id,
        repositories: selectedRepositories,
        organizations: selectedOrganizations,
      });
    } else if (onGithubDataChange) {
      onGithubDataChange(null);
    }

    // Notify parent about ready state
    if (onReadyToSubmitChange) {
      onReadyToSubmitChange(isReady);
    }
  }, [
    githubConnection,
    selectedRepositories,
    selectedOrganizations,
    onGithubDataChange,
    onReadyToSubmitChange,
  ]);

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
          description: "Fetching your repositories and organizations...",
        });
        // Fetch repositories after successful connection
        await onFetchServiceData(connectionRes.value.connection_id);
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

  const handleAddRepository = (repoFullName: string) => {
    if (!selectedRepositories.includes(repoFullName)) {
      setSelectedRepositories([...selectedRepositories, repoFullName]);
    }
    setRepoSearchQuery("");
    setShowRepoDropdown(false);
  };

  const handleRemoveRepository = (repoFullName: string) => {
    setSelectedRepositories(
      selectedRepositories.filter((r) => r !== repoFullName)
    );
  };

  const handleAddOrganization = (orgLogin: string) => {
    if (!selectedOrganizations.includes(orgLogin)) {
      setSelectedOrganizations([...selectedOrganizations, orgLogin]);
    }
    setOrgSearchQuery("");
    setShowOrgDropdown(false);
  };

  const handleRemoveOrganization = (orgLogin: string) => {
    setSelectedOrganizations(
      selectedOrganizations.filter((o) => o !== orgLogin)
    );
  };

  return (
    <div className="flex flex-col space-y-4">
      <div>
        <Label>GitHub Connection</Label>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Connect your GitHub account to select repositories and organizations
          to follow.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant={"outline"}
            label={
              githubConnection ? "Connected to GitHub" : "Connect to GitHub"
            }
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
      </div>

      {githubConnection && (
        <>
          <div>
            <Label>
              Repositories{" "}
              {selectedRepositories.length === 0 &&
                selectedOrganizations.length === 0 && (
                  <span className="text-warning">*</span>
                )}
            </Label>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Select repositories to monitor for events
            </p>
            {isFetchingServiceData ? (
              <div className="mt-2 flex items-center gap-2 py-2">
                <Spinner size="sm" />
                <span className="text-sm text-muted-foreground">
                  Loading repositories...
                </span>
              </div>
            ) : (
              <>
                <div className="mt-2 flex flex-col gap-2">
                  {selectedRepositories.map((repo) => (
                    <div
                      key={repo}
                      className="border-border-light bg-background-light dark:bg-background-dark flex items-center justify-between rounded border px-3 py-2 dark:border-border-dark"
                    >
                      <span className="text-sm font-medium">{repo}</span>
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={XMarkIcon}
                        onClick={() => handleRemoveRepository(repo)}
                      />
                    </div>
                  ))}
                  {githubRepositories.length > 0 && (
                    <DropdownMenu
                      open={showRepoDropdown}
                      onOpenChange={setShowRepoDropdown}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          label="Add repository"
                          variant="outline"
                          icon={PlusIcon}
                          className="w-full"
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
                            filteredRepositories
                              .filter(
                                (repo) =>
                                  !selectedRepositories.includes(repo.full_name)
                              )
                              .map((repo) => (
                                <DropdownMenuItem
                                  key={repo.id}
                                  onClick={() =>
                                    handleAddRepository(repo.full_name)
                                  }
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
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <Label>
              Organizations{" "}
              {selectedRepositories.length === 0 &&
                selectedOrganizations.length === 0 && (
                  <span className="text-warning">*</span>
                )}
            </Label>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Select organizations to monitor all their repositories
            </p>
            {isFetchingServiceData ? (
              <div className="mt-2 flex items-center gap-2 py-2">
                <Spinner size="sm" />
                <span className="text-sm text-muted-foreground">
                  Loading organizations...
                </span>
              </div>
            ) : (
              <>
                <div className="mt-2 flex flex-col gap-2">
                  {selectedOrganizations.map((org) => (
                    <div
                      key={org}
                      className="border-border-light bg-background-light dark:bg-background-dark flex items-center justify-between rounded border px-3 py-2 dark:border-border-dark"
                    >
                      <span className="text-sm font-medium">{org}</span>
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={XMarkIcon}
                        onClick={() => handleRemoveOrganization(org)}
                      />
                    </div>
                  ))}
                  {githubOrganizations.length > 0 && (
                    <DropdownMenu
                      open={showOrgDropdown}
                      onOpenChange={setShowOrgDropdown}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          label="Add organization"
                          variant="outline"
                          icon={PlusIcon}
                          className="w-full"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-80">
                        <DropdownMenuSearchbar
                          name="organization"
                          placeholder="Search organizations..."
                          value={orgSearchQuery}
                          onChange={setOrgSearchQuery}
                        />
                        <div className="max-h-64 overflow-y-auto">
                          {filteredOrganizations.length > 0 ? (
                            filteredOrganizations
                              .filter(
                                (org) =>
                                  !selectedOrganizations.includes(org.login)
                              )
                              .map((org) => (
                                <DropdownMenuItem
                                  key={org.id}
                                  onClick={() =>
                                    handleAddOrganization(org.login)
                                  }
                                >
                                  {org.login}
                                </DropdownMenuItem>
                              ))
                          ) : (
                            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                              No organizations found
                            </div>
                          )}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </>
            )}
          </div>

          {selectedRepositories.length === 0 &&
            selectedOrganizations.length === 0 && (
              <p className="dark:text-warning-night mt-1 text-xs text-warning">
                Please select at least one repository or organization to create
                the webhook
              </p>
            )}
        </>
      )}
    </div>
  );
}
