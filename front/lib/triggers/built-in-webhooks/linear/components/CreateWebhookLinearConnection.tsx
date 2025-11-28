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
import { useDebounce } from "@app/hooks/useDebounce";
import { useWebhookServiceData } from "@app/lib/swr/useWebhookServiceData";
import type { LinearTeam } from "@app/lib/triggers/built-in-webhooks/linear/types";

export function CreateWebhookLinearConnection({
  owner,
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
  connectionId,
}: WebhookCreateFormComponentProps) {
  const [selectedTeams, setSelectedTeams] = useState<LinearTeam[]>([]);

  const {
    inputValue: teamSearchQuery,
    debouncedValue: debouncedTeamSearchQuery,
    setValue: setTeamSearchQuery,
  } = useDebounce("", { delay: 300 });

  const { serviceData: linearData, isServiceDataLoading } =
    useWebhookServiceData({
      owner,
      connectionId,
      provider: "linear",
    });

  const { linearTeams, teamsInDropdown } = useMemo(() => {
    const linearTeams = linearData?.teams ?? [];
    const filteredTeams = linearTeams.filter((team) =>
      `${team.name} (${team.key})`
        .toLowerCase()
        .includes(debouncedTeamSearchQuery.toLowerCase())
    );
    const teamsInDropdown = filteredTeams.filter(
      (team) => !selectedTeams.some((t) => t.id === team.id)
    );
    return { linearTeams, teamsInDropdown };
  }, [linearData, debouncedTeamSearchQuery, selectedTeams]);

  useEffect(() => {
    const isReady = !!(connectionId && selectedTeams.length > 0);

    if (isReady && onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange({
        connectionId,
        remoteMetadata: {
          teams: selectedTeams,
        },
      });
    } else if (onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange(null);
    }

    if (onReadyToSubmitChange) {
      onReadyToSubmitChange(isReady);
    }
  }, [
    connectionId,
    selectedTeams,
    onDataToCreateWebhookChange,
    onReadyToSubmitChange,
  ]);

  const handleAddTeam = (team: LinearTeam) => {
    if (!selectedTeams.some((t) => t.id === team.id)) {
      setSelectedTeams([...selectedTeams, team]);
    }
    setTeamSearchQuery("");
  };

  const handleRemoveTeam = (team: LinearTeam) => {
    setSelectedTeams(selectedTeams.filter((t) => t.id !== team.id));
  };

  return (
    <div className="space-y-6">
      {isServiceDataLoading ? (
        <div className="mt-2 flex items-center gap-2 py-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">
            Loading teams...
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label>
              Teams{" "}
              {selectedTeams.length === 0 && (
                <span className="text-warning">*</span>
              )}
            </Label>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {selectedTeams.map((team) => (
                  <Chip
                    key={team.id}
                    size="xs"
                    label={`${team.name} (${team.key})`}
                    color="primary"
                    className="m-0.5"
                    onRemove={() => handleRemoveTeam(team)}
                  />
                ))}
              </div>
              {linearTeams.length > 0 && (
                <div className="flex">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        label="Add team"
                        variant="outline"
                        icon={PlusIcon}
                        size="sm"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      dropdownHeaders={
                        <DropdownMenuSearchbar
                          name="team"
                          placeholder="Search teams..."
                          value={teamSearchQuery}
                          onChange={setTeamSearchQuery}
                        />
                      }
                      className="w-80"
                      align="start"
                    >
                      <div className="max-h-64">
                        {teamsInDropdown.length > 0 ? (
                          teamsInDropdown.map((team) => (
                            <DropdownMenuItem
                              key={team.id}
                              onClick={() => handleAddTeam(team)}
                            >
                              {team.name} ({team.key})
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                            No teams found
                          </div>
                        )}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </div>

          {selectedTeams.length === 0 && (
            <p className="dark:text-warning-night mt-1 text-xs text-warning">
              Please select at least one team to create the webhook
            </p>
          )}
        </div>
      )}
    </div>
  );
}
