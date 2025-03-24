import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Spinner,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

import { SlackAutoReadPatternsTable } from "@app/components/poke/data_sources/slack/table";
import { useSubmitFunction } from "@app/lib/client/utils";
import { usePokeSpaces } from "@app/poke/swr/spaces";
import type {
  DataSourceType,
  LightWorkspaceType,
  SlackAutoReadPattern,
} from "@app/types";

interface SlackChannelPatternInputProps {
  dataSource: DataSourceType;
  initialValues: SlackAutoReadPattern[];
  owner: LightWorkspaceType;
}

export function SlackChannelPatternInput({
  dataSource,
  initialValues,
  owner,
}: SlackChannelPatternInputProps) {
  const [patterns, setPatterns] =
    useState<SlackAutoReadPattern[]>(initialValues);
  const [newPattern, setNewPattern] = useState<SlackAutoReadPattern>({
    pattern: "",
    spaceId: "",
  });

  const { isLoading, data: spaces } = usePokeSpaces({ owner });
  const sendNotification = useSendNotification();

  const { submit: updatePatterns } = useSubmitFunction(
    async (patterns: SlackAutoReadPattern[]) => {
      const r = await fetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.sId}/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            configKey: "autoReadChannelPatterns",
            configValue: JSON.stringify(patterns),
          }),
        }
      );
      if (!r.ok) {
        throw new Error("Failed to update autoReadChannelPatterns.");
      }
    }
  );

  const handleAdd = useCallback(async () => {
    if (!newPattern.pattern || !newPattern.spaceId) {
      return;
    }

    const updatedPatterns = [...patterns, newPattern];
    try {
      await updatePatterns(updatedPatterns);
      setPatterns(updatedPatterns);
      setNewPattern({ pattern: "", spaceId: "" });
      sendNotification({
        title: "Success!",
        description: "Pattern successfully added.",
        type: "success",
      });
    } catch (e) {
      console.error(e);
      sendNotification({
        title: "Error",
        description: "Failed to add pattern.",
        type: "error",
      });
    }
  }, [patterns, newPattern, updatePatterns, sendNotification]);

  const handleDelete = useCallback(
    async (patternToDelete: SlackAutoReadPattern) => {
      const updatedPatterns = patterns.filter(
        (p) =>
          !(
            p.pattern === patternToDelete.pattern &&
            p.spaceId === patternToDelete.spaceId
          )
      );
      try {
        await updatePatterns(updatedPatterns);
        setPatterns(updatedPatterns);
        sendNotification({
          title: "Success!",
          description: "Pattern successfully deleted.",
          type: "success",
        });
      } catch (e) {
        console.error(e);
        sendNotification({
          title: "Error",
          description: "Failed to delete pattern.",
          type: "error",
        });
      }
    },
    [patterns, updatePatterns, sendNotification]
  );

  const selectedSpace = useMemo(
    () => spaces.find((s) => s.sId === newPattern.spaceId),
    [spaces, newPattern.spaceId]
  );

  if (isLoading) {
    return <Spinner />;
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-2">
        <SlackAutoReadPatternsTable
          autoReadPatterns={patterns}
          onDelete={handleDelete}
          spaces={spaces}
        />
      </div>

      <div className="flex items-end gap-2 border-t pt-4">
        <div className="flex-1">
          <Input
            type="text"
            placeholder="New pattern (e.g. incidents-.*)"
            value={newPattern.pattern}
            onChange={(e) =>
              setNewPattern((p) => ({ ...p, pattern: e.target.value }))
            }
          />
        </div>
        <div className="flex-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild value={newPattern.spaceId}>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                label={selectedSpace ? selectedSpace.name : "Select a Space"}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-60">
              {spaces.map((s) => {
                return (
                  <DropdownMenuItem
                    key={s.sId}
                    onClick={() => {
                      setNewPattern((p) => ({ ...p, spaceId: s.sId }));
                    }}
                  >
                    {s.name}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          onClick={handleAdd}
          disabled={!newPattern.pattern || !newPattern.spaceId}
          variant="secondary"
          label="Add Pattern"
        />
      </div>
    </div>
  );
}
