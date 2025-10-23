import { Button, Spinner } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { WebhookCreateFormComponentProps } from "@app/components/triggers/webhook_preset_components";
import { useSendNotification } from "@app/hooks/useNotification";
import { setupOAuthConnection } from "@app/types";

import type { JiraProject } from "../jira_service_types";
import { isJiraAdditionalData } from "../jira_service_types";

export function CreateWebhookJiraConnection({
  owner,
  serviceData,
  isFetchingServiceData,
  onFetchServiceData,
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
}: WebhookCreateFormComponentProps) {
  const [jiraConnection, setJiraConnection] = useState<any>(null);
  const [isConnectingJira, setIsConnectingJira] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<JiraProject[]>([]);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  const sendNotification = useSendNotification();

  const jiraData = isJiraAdditionalData(serviceData) ? serviceData : null;

  const handleConnectJira = async () => {
    setIsConnectingJira(true);
    try {
      const connectionRes = await setupOAuthConnection({
        dustClientFacingUrl: process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL,
        provider: "jira",
        useCase: "webhooks",
        extraConfig: {},
      });

      if (connectionRes.isOk()) {
        setJiraConnection(connectionRes.value.connection);
        await onFetchServiceData(connectionRes.value.connection.connection_id);
      } else {
        sendNotification({
          type: "error",
          title: "Failed to connect to Jira",
          description: connectionRes.error.message,
        });
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect to Jira",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsConnectingJira(false);
    }
  };

  // Notify parent when data changes
  useEffect(() => {
    const isReady = jiraConnection && selectedProjects.length > 0;
    onReadyToSubmitChange?.(isReady);

    if (isReady) {
      onDataToCreateWebhookChange?.({
        connectionId: jiraConnection.connection_id,
        remoteMetadata: {
          projects: selectedProjects,
          cloudId: jiraData?.cloudId || "",
          siteUrl: jiraData?.siteUrl || "",
        },
      });
    } else {
      onDataToCreateWebhookChange?.(null);
    }
  }, [
    jiraConnection,
    selectedProjects,
    jiraData,
    onDataToCreateWebhookChange,
    onReadyToSubmitChange,
  ]);

  const filteredProjects =
    jiraData?.projects.filter(
      (project) =>
        project.name.toLowerCase().includes(projectSearchQuery.toLowerCase()) ||
        project.key.toLowerCase().includes(projectSearchQuery.toLowerCase())
    ) || [];

  const unselectedProjects = filteredProjects.filter(
    (project) => !selectedProjects.some((p) => p.key === project.key)
  );

  return (
    <div className="space-y-4">
      {/* Connection Section */}
      <div className="space-y-2">
        <label className="text-element-900 text-sm font-medium">
          Jira Connection
        </label>
        {jiraConnection ? (
          <div className="flex items-center gap-2">
            <div className="text-element-700 text-sm">
              Connected to: {jiraData?.siteUrl || "Jira"}
            </div>
          </div>
        ) : (
          <Button
            label="Connect to Jira"
            onClick={handleConnectJira}
            disabled={isConnectingJira}
            variant="primary"
          />
        )}
      </div>

      {/* Projects Section */}
      {jiraConnection && (
        <div className="space-y-2">
          <label className="text-element-900 text-sm font-medium">
            Projects {selectedProjects.length === 0 && "*"}
          </label>
          {isFetchingServiceData ? (
            <Spinner />
          ) : (
            <>
              {/* Selected Projects */}
              {selectedProjects.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedProjects.map((project) => (
                    <div
                      key={project.key}
                      className="border-element-500 flex items-center gap-2 rounded border bg-white px-3 py-1"
                    >
                      <span className="text-sm">{project.name}</span>
                      <button
                        onClick={() =>
                          setSelectedProjects((prev) =>
                            prev.filter((p) => p.key !== project.key)
                          )
                        }
                        className="text-element-600 hover:text-element-900"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Project Dropdown */}
              <div className="relative">
                <Button
                  label="Add project"
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  variant="secondary"
                  size="sm"
                />
                {showProjectDropdown && (
                  <div className="border-structure-200 absolute z-10 mt-2 w-full rounded border bg-white shadow-lg">
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={projectSearchQuery}
                      onChange={(e) => setProjectSearchQuery(e.target.value)}
                      className="border-structure-200 w-full border-b px-3 py-2 text-sm focus:outline-none"
                    />
                    <div className="max-h-64 overflow-y-auto">
                      {unselectedProjects.length > 0 ? (
                        unselectedProjects.map((project) => (
                          <button
                            key={project.key}
                            onClick={() => {
                              setSelectedProjects((prev) => [...prev, project]);
                              setShowProjectDropdown(false);
                              setProjectSearchQuery("");
                            }}
                            className="hover:bg-action-50 w-full px-3 py-2 text-left text-sm"
                          >
                            <div className="font-medium">{project.name}</div>
                            <div className="text-element-600 text-xs">
                              {project.key}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="text-element-600 px-3 py-2 text-sm">
                          No projects found
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {selectedProjects.length === 0 && (
                <div className="text-sm text-warning-500">
                  * Please select at least one project to create the webhook
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
