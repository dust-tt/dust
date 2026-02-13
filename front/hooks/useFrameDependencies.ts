import { useEffect, useState } from "react";

import { clientFetch } from "@app/lib/egress/client";
import { extractFileDependencies } from "@app/lib/files";
import type { FileType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Hook to fetch frame dependencies (files referenced via useFile()).
 *
 * @param owner Workspace
 * @param fileId Frame file ID
 * @param frameContent Frame code content (optional, if already loaded)
 * @returns Dependencies, loading state, and error
 */
export function useFrameDependencies({
  owner,
  fileId,
  frameContent,
}: {
  owner: LightWorkspaceType;
  fileId: string;
  frameContent?: string | null;
}) {
  const [dependencies, setDependencies] = useState<FileType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function fetchDependencies() {
      try {
        setIsLoading(true);
        setError(null);

        // If frame content not provided, fetch it
        let content = frameContent;
        if (!content) {
          const response = await clientFetch(
            `/api/w/${owner.sId}/files/${fileId}`
          );
          if (!response.ok) {
            throw new Error("Failed to fetch frame content");
          }
          const data = await response.json();
          content = data.file?.content;
        }

        if (!content) {
          setDependencies([]);
          return;
        }

        // Extract file IDs from frame code
        const fileIds = extractFileDependencies(content);

        if (fileIds.length === 0) {
          setDependencies([]);
          return;
        }

        // Fetch file metadata for each dependency
        const deps = await Promise.all(
          fileIds.map(async (id) => {
            try {
              const res = await clientFetch(`/api/w/${owner.sId}/files/${id}`);
              if (!res.ok) {
                return null;
              }
              const data = await res.json();
              return data.file as FileType;
            } catch (err) {
              console.error(`Failed to fetch file ${id}:`, err);
              return null;
            }
          })
        );

        if (!isCancelled) {
          setDependencies(
            deps.filter((d): d is FileType => d !== null && d !== undefined)
          );
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchDependencies();

    return () => {
      isCancelled = true;
    };
  }, [owner.sId, fileId, frameContent]);

  return { dependencies, isLoading, error };
}
