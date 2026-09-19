import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { SpaceType } from "@app/types/space";
import {
  DataTable,
  ScrollArea,
  SearchInput,
  Separator,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useState } from "react";
import { useController, useFormContext } from "react-hook-form";

type RowData = {
  name: string;
  space: SpaceType;
  isEnabled: boolean;
  onClick: () => void;
};

const ActionCell = ({
  isEnabled,
  onToggle,
}: {
  isEnabled: boolean;
  onToggle: () => void;
}) => {
  return (
    <DataTable.CellContent>
      <SliderToggle
        selected={isEnabled}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      />
    </DataTable.CellContent>
  );
};

/** One switchable availability rule, with the copy that explains its state. */
function AvailabilityRule({
  title,
  selected,
  onToggle,
  children,
}: {
  title: string;
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-y-2">
      <div className="flex w-full items-center justify-between overflow-visible">
        <h3 className="heading-base text-foreground">{title}</h3>
        <SliderToggle
          selected={selected}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        />
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

interface MCPServerDetailsAvailabilityProps {
  mcpServerView: MCPServerViewType | null;
  spaces: SpaceType[];
  confirmSkillsRestrictionChange?: (
    isRestrictedToSkills: boolean
  ) => Promise<boolean>;
}

/**
 * Two rules narrow down who reaches the tool: whether a skill has to carry it,
 * and whether the whole workspace gets it or a hand-picked set of Spaces. The
 * Space table only exists in that second case, which is why the toggle hides it
 * — and why it sits last, where it can grow without moving anything.
 */
export function MCPServerDetailsAvailability({
  mcpServerView,
  spaces,
  confirmSkillsRestrictionChange,
}: MCPServerDetailsAvailabilityProps) {
  const form = useFormContext<MCPServerFormValues>();
  const sharingSettings = form.watch("sharingSettings") || {};
  const [filter, setFilter] = useState("");

  const { field: isRestrictedToSkillsField } = useController({
    name: "isRestrictedToSkills",
    control: form.control,
  });

  // Space reach only applies to tools an admin installs; auto-available servers
  // are workspace-wide by construction and have no Sharing surface.
  const hasSpaceReach = mcpServerView?.server.availability === "manual";

  const globalSpace = spaces.find((space) => space.kind === "global");
  const availableSpaces = spaces.filter((s) => s.kind === "regular");

  const isRestricted = globalSpace ? !sharingSettings?.[globalSpace.sId] : true;

  const handleToggle = (space: SpaceType) => {
    const currentState = sharingSettings?.[space.sId] ?? false;

    form.setValue(`sharingSettings.${space.sId}`, !currentState, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const handleSkillsRestrictionChange = async (
    isRestrictedToSkills: boolean
  ) => {
    if (confirmSkillsRestrictionChange) {
      const confirmed =
        await confirmSkillsRestrictionChange(isRestrictedToSkills);
      if (!confirmed) {
        return;
      }
    }

    isRestrictedToSkillsField.onChange(isRestrictedToSkills);
  };

  const rows: RowData[] = availableSpaces
    .map((space) => ({
      name: space.name,
      space: space,
      isEnabled: sharingSettings?.[space.sId] ?? false,
      onClick: () => handleToggle(space),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const columns: ColumnDef<RowData, any>[] = [
    {
      id: "name",
      header: "Name",
      accessorKey: "name",
    },
    {
      id: "action",
      header: "",
      accessorKey: "isEnabled",
      meta: {
        className: "w-14",
      },
      cell: (info: CellContext<RowData, boolean>) => (
        <ActionCell
          isEnabled={info.row.original.isEnabled}
          onToggle={info.row.original.onClick}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="pt-2">
        <AvailabilityRule
          title="Restrict this tool to skills"
          selected={isRestrictedToSkillsField.value}
          onToggle={() => {
            void handleSkillsRestrictionChange(
              !isRestrictedToSkillsField.value
            );
          }}
        >
          {isRestrictedToSkillsField.value
            ? "Agents can only reach this tool through a skill, which carries the workspace context and safety rules with it."
            : "Agents can pick this tool up on its own, without a skill to frame how it is used."}
        </AvailabilityRule>
      </div>

      {hasSpaceReach && (
        <>
          <Separator />

          <AvailabilityRule
            title="Available to all workspace members"
            selected={!isRestricted}
            onToggle={() => {
              if (globalSpace) {
                handleToggle(globalSpace);
              }
            }}
          >
            {isRestricted
              ? "These tools are only available to the users of the selected spaces."
              : "These tools are accessible to everyone in the workspace."}
          </AvailabilityRule>

          {isRestricted && (
            <div className="flex flex-col gap-2">
              <SearchInput
                name="filter"
                placeholder="Search a space"
                className="w-full"
                value={filter}
                onChange={(e) => setFilter(e)}
              />

              <ScrollArea className="h-full">
                <DataTable<RowData>
                  data={rows}
                  columns={columns}
                  filter={filter}
                  filterColumn="name"
                />
              </ScrollArea>
            </div>
          )}
        </>
      )}
    </div>
  );
}
