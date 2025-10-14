import {
  DataTable,
  Page,
  ScrollArea,
  SearchInput,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { WebhookSourceFormValues } from "@app/components/triggers/forms/webhookSourceFormSchema";
import type { LightWorkspaceType } from "@app/types";
import type { SpaceType } from "@app/types/space";
import type { WebhookSourceWithViewsType } from "@app/types/triggers/webhooks";

type WebhookSourceDetailsSharingProps = {
  webhookSource: WebhookSourceWithViewsType;
  owner: LightWorkspaceType;
  spaces: SpaceType[];
};

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

export function WebhookSourceDetailsSharing({
  spaces,
}: WebhookSourceDetailsSharingProps) {
  const [filter, setFilter] = useState("");
  const form = useFormContext<WebhookSourceFormValues>();
  const sharingSettings = useWatch({
    control: form.control,
    name: "sharingSettings",
  });

  const globalSpace = spaces.find((space) => space.kind === "global");
  const availableSpaces = spaces.filter((s) => s.kind === "regular");

  const isRestricted = globalSpace ? !sharingSettings?.[globalSpace.sId] : true;

  const handleToggle = (space: SpaceType) => {
    const currentState = sharingSettings?.[space.sId] ?? false;
    const newState = !currentState;

    form.setValue(`sharingSettings.${space.sId}`, newState, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
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
    <div className="flex flex-col gap-2">
      <div className="mb-2 flex w-full flex-col gap-y-2 pt-2">
        <div className="flex w-full items-center justify-between overflow-visible">
          <Page.SectionHeader title="Available to all Spaces" />
          <SliderToggle
            selected={!isRestricted}
            onClick={(e) => {
              e.stopPropagation();
              if (globalSpace) {
                handleToggle(globalSpace);
              }
            }}
          />
        </div>
      </div>
      <div className="text-foreground dark:text-foreground-night">
        {isRestricted ? (
          <>
            These tools are only available to the users of the selected spaces:
          </>
        ) : (
          <>These tools are accessible to everyone in the workspace.</>
        )}
      </div>

      {isRestricted && (
        <>
          <div className="flex w-full flex-row gap-2">
            <SearchInput
              name="filter"
              placeholder="Search a space"
              value={filter}
              onChange={(e) => setFilter(e)}
              className="w-full"
            />
          </div>

          <ScrollArea className="h-full">
            <DataTable<RowData>
              data={rows}
              columns={columns}
              filter={filter}
              filterColumn="name"
            />
          </ScrollArea>
        </>
      )}
    </div>
  );
}
