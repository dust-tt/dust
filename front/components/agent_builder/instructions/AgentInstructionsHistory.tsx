import {
  formatDateTime,
  NUMERIC_DATE_TIME_OPTIONS,
} from "@app/lib/i18n/format";
import { useMembersLookup } from "@app/lib/swr/memberships";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ClockRewind,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { compareDesc } from "date-fns";
import { useCallback, useMemo } from "react";

interface AgentInstructionsHistoryProps {
  history: LightAgentConfigurationType[];
  selectedConfig: LightAgentConfigurationType | null;
  onSelect: (config: LightAgentConfigurationType) => void;
  owner: LightWorkspaceType;
}

export function AgentInstructionsHistory({
  history,
  onSelect,
  selectedConfig,
  owner,
}: AgentInstructionsHistoryProps) {
  const { t } = useLingui();
  const authorIdsToLookup = useMemo(() => {
    const ids = new Set<number>();
    history.forEach((config) => {
      if (config.versionAuthorId) {
        ids.add(Number(config.versionAuthorId));
      }
    });

    return Array.from(ids);
  }, [history]);

  const { members: authorLookupMembers, isMembersLookupLoading } =
    useMembersLookup({
      workspaceId: owner.sId,
      memberIds: authorIdsToLookup,
      disabled: authorIdsToLookup.length === 0,
    });

  const authorMap = useMemo(() => {
    const map: Record<string, string> = {};
    authorLookupMembers.forEach((user) => {
      map[user.id.toString()] = user.fullName || user.firstName || t`Unknown`;
    });
    return map;
  }, [authorLookupMembers, t]);

  const formatVersionLabel = useCallback(
    (config: LightAgentConfigurationType) => {
      const version = config.version;
      return config.versionCreatedAt
        ? formatDateTime(
            new Date(config.versionCreatedAt),
            NUMERIC_DATE_TIME_OPTIONS
          )
        : t({ message: `v${version}`, context: "version number" });
    },
    [t]
  );

  const getAuthorName = useCallback(
    (config: LightAgentConfigurationType) => {
      if (!config.versionAuthorId) {
        return t({ message: "System", context: "author of a version" });
      }
      return authorMap[config.versionAuthorId.toString()] || t`Unknown`;
    },
    [authorMap, t]
  );

  const historyWithPrev = useMemo(() => {
    const currentVersion = Math.max(...history.map((h) => h.version));

    const sorted = [...history]
      .filter((config) => config.version !== currentVersion)
      .sort((a, b) =>
        compareDesc(
          a.versionCreatedAt ?? a.version,
          b.versionCreatedAt ?? b.version
        )
      );

    const result: LightAgentConfigurationType[] = [];

    let lastRawInstructions: string | null = null;

    for (const config of sorted) {
      const instructions = config.instructions ?? "";
      const isNewRun =
        lastRawInstructions === null || instructions !== lastRawInstructions;

      if (isNewRun) {
        result.push(config);
      } else if (config.version === selectedConfig?.version) {
        result[result.length - 1] = config;
      }

      lastRawInstructions = instructions;
    }

    return result;
  }, [history, selectedConfig]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          icon={ClockRewind}
          size="icon"
          tooltip={t`Compare with previous versions`}
          isSelect
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="h-96 w-72"
        dropdownHeaders={
          <>
            <DropdownMenuLabel label={t`Choose version to compare`} />
            <DropdownMenuSeparator />
          </>
        }
      >
        {isMembersLookupLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <DropdownMenuRadioGroup
            value={selectedConfig?.version.toString() ?? ""}
            onValueChange={(selectedValue) => {
              const config = history.find(
                (c) => c.version.toString() === selectedValue
              );
              if (config) {
                onSelect(config);
              }
            }}
          >
            {historyWithPrev.map((config) => {
              const authorName = getAuthorName(config);
              return (
                <DropdownMenuRadioItem
                  key={config.version}
                  value={config.version.toString()}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex flex-col">
                      <span>{formatVersionLabel(config)}</span>
                      <span className="text-xs text-muted-foreground">
                        <Trans>by {authorName}</Trans>
                      </span>
                    </div>
                  </div>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
