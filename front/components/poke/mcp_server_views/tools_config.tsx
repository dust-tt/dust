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
import {
  Button,
  Chip,
  Clipboard,
  ClipboardCheck,
  CodeBlock,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

type ToolType = PokeMCPServerViewType["server"]["tools"][number];

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
  inputSchema: ToolType["inputSchema"];
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

interface ToolDetailsSheetProps {
  tool: ToolConfigRow | null;
  onClose: () => void;
}

function ToolDetailsSheet({ tool, onClose }: ToolDetailsSheetProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();

  const schemaString = tool?.inputSchema
    ? JSON.stringify(tool.inputSchema, null, 2)
    : null;

  return (
    <Sheet
      open={tool !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="lg">
        {tool && (
          <>
            <SheetHeader>
              <SheetTitle>{asDisplayName(tool.name)}</SheetTitle>
              <SheetDescription>
                <span className="flex items-center gap-1.5">
                  {!tool.enabled && (
                    <Chip size="xs" color="warning" label="Disabled by admin" />
                  )}
                  {tool.stakeOverridden && (
                    <>
                      <StakeChip
                        permission={tool.defaultPermission}
                        className="line-through opacity-60"
                      />
                      →
                    </>
                  )}
                  <StakeChip permission={tool.permission} />
                </span>
              </SheetDescription>
            </SheetHeader>
            <SheetContainer>
              <div className="flex flex-col gap-4">
                <div>
                  <span className="font-medium text-foreground dark:text-foreground-night">
                    Description
                  </span>
                  <p className="py-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {tool.description || "No description."}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground dark:text-foreground-night">
                      Input schema
                    </span>
                    {schemaString && (
                      <Button
                        variant="outline"
                        size="xs"
                        icon={isCopied ? ClipboardCheck : Clipboard}
                        label={isCopied ? "Copied!" : "Copy"}
                        onClick={() => {
                          void copyToClipboard(schemaString);
                        }}
                      />
                    )}
                  </div>
                  <div className="py-2">
                    {schemaString ? (
                      <CodeBlock
                        className="language-json max-h-96 overflow-y-auto"
                        wrapLongLines={true}
                      >
                        {schemaString}
                      </CodeBlock>
                    ) : (
                      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                        No input schema.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </SheetContainer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface ToolsConfigTableProps {
  mcpServerView: PokeMCPServerViewType;
}

export function ToolsConfigTable({ mcpServerView }: ToolsConfigTableProps) {
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);

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
        inputSchema: tool.inputSchema,
        enabled: override?.enabled ?? true,
        permission,
        defaultPermission,
        stakeOverridden: permission !== defaultPermission,
      };
    });
  }, [mcpServerView.server, mcpServerView.toolsMetadata]);

  const selectedTool =
    rows.find((row) => row.name === selectedToolName) ?? null;

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
              <PokeTableRow
                key={row.name}
                className="cursor-pointer"
                onClick={() => setSelectedToolName(row.name)}
              >
                <PokeTableCell>
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
                      <Chip size="xs" color="warning" label="Edited by admin" />
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
      <ToolDetailsSheet
        tool={selectedTool}
        onClose={() => setSelectedToolName(null)}
      />
    </div>
  );
}
