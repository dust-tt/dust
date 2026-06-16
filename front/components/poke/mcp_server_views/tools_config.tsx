import { getDefaultInternalToolStakeLevel } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableHead,
  PokeTableHeader,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { PokeMCPServerViewType } from "@app/types/poke";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import { Chip } from "@dust-tt/sparkle";
import { useMemo } from "react";

const STAKE_LABELS: Record<MCPToolStakeLevelType, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  never_ask: "Never ask",
};

const STAKE_COLORS = {
  high: "rose",
  medium: "golden",
  low: "blue",
  never_ask: "green",
} as const satisfies Record<MCPToolStakeLevelType, string>;

interface ToolConfigRow {
  name: string;
  description: string;
  enabled: boolean;
  permission: MCPToolStakeLevelType;
  defaultPermission: MCPToolStakeLevelType;
  stakeOverridden: boolean;
}

interface StakeChipProps {
  permission: MCPToolStakeLevelType;
  className?: string;
}

function StakeChip({ permission, className }: StakeChipProps) {
  return (
    <Chip
      size="xs"
      color={STAKE_COLORS[permission]}
      label={STAKE_LABELS[permission]}
      className={className}
    />
  );
}

interface ToolsConfigTableProps {
  mcpServerView: PokeMCPServerViewType;
}

export function ToolsConfigTable({ mcpServerView }: ToolsConfigTableProps) {
  const rows = useMemo<ToolConfigRow[]>(() => {
    const overridesByName = new Map(
      (mcpServerView.toolsMetadata ?? []).map((m) => [m.toolName, m])
    );

    return mcpServerView.server.tools.map((tool) => {
      const override = overridesByName.get(tool.name);
      const defaultPermission = getDefaultInternalToolStakeLevel(
        mcpServerView.server,
        tool.name
      );
      const permission = override?.permission ?? defaultPermission;

      return {
        name: tool.name,
        description: tool.description,
        enabled: override?.enabled ?? true,
        permission,
        defaultPermission,
        stakeOverridden: permission !== defaultPermission,
      };
    });
  }, [mcpServerView.server, mcpServerView.toolsMetadata]);

  return (
    <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
      <h2 className="text-md pb-4 font-bold">Tools configuration</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          This server exposes no tools.
        </p>
      ) : (
        <PokeTable>
          <PokeTableHeader>
            <PokeTableRow>
              <PokeTableHead>Tool</PokeTableHead>
              <PokeTableHead>Stake</PokeTableHead>
            </PokeTableRow>
          </PokeTableHeader>
          <PokeTableBody>
            {rows.map((row) => (
              <PokeTableRow key={row.name}>
                <PokeTableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-medium",
                          !row.enabled &&
                            "text-muted-foreground line-through dark:text-muted-foreground-night"
                        )}
                      >
                        {asDisplayName(row.name)}
                      </span>
                      {!row.enabled && (
                        <Chip
                          size="xs"
                          color="warning"
                          label="Disabled by admin"
                        />
                      )}
                      {row.stakeOverridden && (
                        <Chip
                          size="xs"
                          color="warning"
                          label="Edited by admin"
                        />
                      )}
                    </div>
                    {row.description && (
                      <span
                        className={cn(
                          "text-sm text-muted-foreground dark:text-muted-foreground-night",
                          !row.enabled && "line-through"
                        )}
                      >
                        {row.description}
                      </span>
                    )}
                  </div>
                </PokeTableCell>
                <PokeTableCell>
                  <span
                    className={cn(
                      "flex items-center gap-1.5",
                      !row.enabled && "opacity-60"
                    )}
                  >
                    {row.stakeOverridden && (
                      <>
                        <StakeChip
                          permission={row.defaultPermission}
                          className="line-through opacity-60"
                        />
                        →
                      </>
                    )}
                    <StakeChip
                      permission={row.permission}
                      className={cn(!row.enabled && "line-through")}
                    />
                  </span>
                </PokeTableCell>
              </PokeTableRow>
            ))}
          </PokeTableBody>
        </PokeTable>
      )}
    </div>
  );
}
