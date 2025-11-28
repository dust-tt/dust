import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Label,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import type { WebhookCreateFormComponentProps } from "@app/components/triggers/webhook_preset_components";
import { useWebhookServiceData } from "@app/lib/swr/useWebhookServiceData";
import type {
  GithubOrganization,
  GithubRepository,
} from "@app/lib/triggers/built-in-webhooks/github/types";

export function CreateWebhookGithubConnection({
  owner,
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
  connectionId,
}: WebhookCreateFormComponentProps) {
  const [selectedRepositories, setSelectedRepositories] = useState<
    GithubRepository[]
  >([]);
  const [selectedOrganizations, setSelectedOrganizations] = useState<
    GithubOrganization[]
  >([]);
  const [repoSearchQuery, setRepoSearchQuery] = useState("");

  const { serviceData: githubData, isServiceDataLoading } =
    useWebhookServiceData({
      owner,
      connectionId,
      provider: "github",
    });
  const [orgSearchQuery, setOrgSearchQuery] = useState("");
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);

  const { githubRepositories, filteredRepositories } = useMemo(() => {
    const githubRepositories = githubData?.repositories ?? [];
    const filteredRepositories = githubRepositories.filter((repo) =>
      repo.fullName.toLowerCase().includes(repoSearchQuery.toLowerCase())
    );
    return { githubRepositories, filteredRepositories };
  }, [githubData, repoSearchQuery]);

  const { githubOrganizations, filteredOrganizations } = useMemo(() => {
    const githubOrganizations = githubData?.organizations ?? [];
    const filteredOrganizations = githubOrganizations.filter((org) =>
      org.name.toLowerCase().includes(orgSearchQuery.toLowerCase())
    );
    return { githubOrganizations, filteredOrganizations };
  }, [githubData, orgSearchQuery]);

  const repositoriesInDropdown = useMemo(
    () =>
      filteredRepositories.filter(
        (repo) =>
          !selectedRepositories.some((r) => r.fullName === repo.fullName)
      ),
    [filteredRepositories, selectedRepositories]
  );

  const organizationsInDropdown = useMemo(
    () =>
      filteredOrganizations.filter(
        (org) => !selectedOrganizations.some((o) => o.name === org.name)
      ),
    [filteredOrganizations, selectedOrganizations]
  );

  // Notify parent component when data changes
  useEffect(() => {
    const isReady = !!(
      connectionId &&
      (selectedRepositories.length > 0 || selectedOrganizations.length > 0)
    );

    if (isReady && onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange({
        connectionId,
        remoteMetadata: {
          repositories: selectedRepositories,
          organizations: selectedOrganizations,
        },
      });
    } else if (onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange(null);
    }

    // Notify parent about ready state
    if (onReadyToSubmitChange) {
      onReadyToSubmitChange(isReady);
    }
  }, [
    connectionId,
    selectedRepositories,
    selectedOrganizations,
    onDataToCreateWebhookChange,
    onReadyToSubmitChange,
  ]);

  const handleAddRepository = (repo: GithubRepository) => {
    if (!selectedRepositories.some((r) => r.fullName === repo.fullName)) {
      setSelectedRepositories([...selectedRepositories, repo]);
    }
    setRepoSearchQuery("");
    setShowRepoDropdown(false);
  };

  const handleRemoveRepository = (repo: GithubRepository) => {
    setSelectedRepositories(
      selectedRepositories.filter((r) => r.fullName !== repo.fullName)
    );
  };

  const handleAddOrganization = (org: GithubOrganization) => {
    if (!selectedOrganizations.some((o) => o.name === org.name)) {
      setSelectedOrganizations([...selectedOrganizations, org]);
    }
    setOrgSearchQuery("");
    setShowOrgDropdown(false);
  };

  const handleRemoveOrganization = (org: GithubOrganization) => {
    setSelectedOrganizations(
      selectedOrganizations.filter((o) => o.name !== org.name)
    );
  };

  return (
    <div className="flex flex-col space-y-4">
      {isServiceDataLoading ? (
        <div className="mt-2 flex items-center gap-2 py-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">
            Loading repositories and organizations...
          </span>
        </div>
      ) : (
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
              Choose which repositories can activate this trigger
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {selectedRepositories.map((repo) => (
                  <Chip
                    key={repo.fullName}
                    size="xs"
                    label={repo.fullName}
                    color="primary"
                    className="m-0.5"
                    onRemove={() => handleRemoveRepository(repo)}
                  />
                ))}
              </div>
              {githubRepositories.length > 0 && (
                <div className="flex">
                  <DropdownMenu
                    open={showRepoDropdown}
                    onOpenChange={setShowRepoDropdown}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        label="Add repository"
                        variant="outline"
                        icon={PlusIcon}
                        size="sm"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-80" align="start">
                      <DropdownMenuSearchbar
                        name="repository"
                        placeholder="Search repositories..."
                        value={repoSearchQuery}
                        onChange={setRepoSearchQuery}
                      />
                      <div className="max-h-64 overflow-y-auto">
                        {repositoriesInDropdown.length > 0 ? (
                          repositoriesInDropdown.map((repo) => (
                            <DropdownMenuItem
                              key={repo.fullName}
                              onClick={() => handleAddRepository(repo)}
                            >
                              {repo.fullName}
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
                </div>
              )}
            </div>
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
              Choose which organizations can activate this trigger
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {selectedOrganizations.map((org) => (
                  <Chip
                    key={org.name}
                    size="xs"
                    label={org.name}
                    color="primary"
                    className="m-0.5"
                    onRemove={() => handleRemoveOrganization(org)}
                  />
                ))}
              </div>
              {githubOrganizations.length > 0 && (
                <div className="flex">
                  <DropdownMenu
                    open={showOrgDropdown}
                    onOpenChange={setShowOrgDropdown}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        label="Add organization"
                        variant="outline"
                        icon={PlusIcon}
                        size="sm"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-80" align="start">
                      <DropdownMenuSearchbar
                        name="organization"
                        placeholder="Search organizations..."
                        value={orgSearchQuery}
                        onChange={setOrgSearchQuery}
                      />
                      <div className="max-h-64 overflow-y-auto">
                        {organizationsInDropdown.length > 0 ? (
                          organizationsInDropdown.map((org) => (
                            <DropdownMenuItem
                              key={org.name}
                              onClick={() => handleAddOrganization(org)}
                            >
                              {org.name}
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
                </div>
              )}
            </div>
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
