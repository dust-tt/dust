import { useCallback, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { LightWorkspaceType } from "@app/types";

type GithubRepository = {
  name: string;
  full_name: string;
  id: number;
};

type GithubOrganization = {
  id: number;
  login: string;
  avatar_url: string;
  description: string | null;
};

export function useGithubRepositories(owner: LightWorkspaceType | null) {
  const sendNotification = useSendNotification();
  const [githubRepositories, setGithubRepositories] = useState<
    GithubRepository[]
  >([]);
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);

  const fetchGithubRepositories = useCallback(
    async (connectionId: string) => {
      if (!owner) {
        return;
      }

      setIsFetchingRepos(true);
      try {
        const response = await fetch(
          `/api/w/${owner.sId}/github/${connectionId}/repos`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch repositories");
        }

        const data = await response.json();
        setGithubRepositories(data.repositories || []);
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to fetch repositories",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsFetchingRepos(false);
      }
    },
    [owner, sendNotification]
  );

  return {
    githubRepositories,
    isFetchingRepos,
    fetchGithubRepositories,
  };
}

export function useGithubOrganizations(owner: LightWorkspaceType | null) {
  const sendNotification = useSendNotification();
  const [githubOrganizations, setGithubOrganizations] = useState<
    GithubOrganization[]
  >([]);
  const [isFetchingOrgs, setIsFetchingOrgs] = useState(false);

  const fetchGithubOrganizations = useCallback(
    async (connectionId: string) => {
      if (!owner) {
        return;
      }

      setIsFetchingOrgs(true);
      try {
        const response = await fetch(
          `/api/w/${owner.sId}/github/${connectionId}/orgs`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch organizations");
        }

        const data = await response.json();
        setGithubOrganizations(data.organizations || []);
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to fetch organizations",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsFetchingOrgs(false);
      }
    },
    [owner, sendNotification]
  );

  return {
    githubOrganizations,
    isFetchingOrgs,
    fetchGithubOrganizations,
  };
}
