import type { ImportFormValues } from "@app/components/skills/import/formSchema";
import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import {
  type DetectedSkillStatus,
  isImportableSkillStatus,
} from "@app/lib/skill_detection";
import {
  Chip,
  ContentMessage,
  createSelectionColumn,
  DataTable,
  InformationCircleIcon,
  PuzzleIcon,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";

const STATUS_CHIP_LABEL: Record<
  Exclude<DetectedSkillStatus, "ready">,
  string
> = {
  name_conflict: "Skill name already in use",
  skill_already_exists: "Override existing skill",
  invalid: "Invalid skill format",
};

interface SkillRowData {
  name: string;
  status: DetectedSkillStatus;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

type SkillCellInfo = CellContext<SkillRowData, unknown>;

function getColumns(): ColumnDef<SkillRowData>[] {
  return [
    createSelectionColumn<SkillRowData>(),
    {
      id: "name",
      accessorKey: "name",
      header: "Skill name",
      cell: (info: SkillCellInfo) => (
        <DataTable.CellContent icon={PuzzleIcon}>
          {info.row.original.name}
        </DataTable.CellContent>
      ),
      meta: {
        sizeRatio: 60,
      },
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      cell: (info: SkillCellInfo) => {
        const { status } = info.row.original;
        if (status === "ready") {
          return null;
        }
        return (
          <Chip
            label={STATUS_CHIP_LABEL[status]}
            size="xs"
            color={status === "skill_already_exists" ? "info" : "warning"}
          />
        );
      },
      meta: {
        sizeRatio: 40,
      },
    },
  ];
}

interface DetectedSkillsListProps {
  detectedSkills: DetectedSkillSummary[];
  isDetecting: boolean;
  detectError: string | null;
}

export function DetectedSkillsList({
  detectedSkills,
  isDetecting,
  detectError,
}: DetectedSkillsListProps) {
  const { control, setValue } = useFormContext<ImportFormValues>();
  const { field: selectedField } = useController({
    name: "selectedSkillNames",
    control,
  });

  const rows = useMemo<SkillRowData[]>(
    () =>
      detectedSkills.map((s) => ({
        name: s.name,
        status: s.status,
      })),
    [detectedSkills]
  );

  const columns = useMemo(() => getColumns(), []);

  // Build rowSelection state from selectedSkillNames form field.
  const rowSelection = useMemo(() => {
    const selection: Record<string, boolean> = {};
    for (const name of selectedField.value) {
      selection[name] = true;
    }
    return selection;
  }, [selectedField.value]);

  // Sync rowSelection changes back to the form field.
  const setRowSelection = (newSelection: Record<string, boolean>) => {
    const names = Object.keys(newSelection).filter((k) => newSelection[k]);
    setValue("selectedSkillNames", names, { shouldValidate: true });
  };

  // Auto-select all importable skills when detected skills change.
  useEffect(() => {
    if (detectedSkills.length > 0) {
      const importableNames = detectedSkills
        .filter((s) => isImportableSkillStatus(s.status))
        .map((s) => s.name);
      setValue("selectedSkillNames", importableNames, { shouldValidate: true });
    }
  }, [detectedSkills, setValue]);

  return (
    <>
      {detectError && (
        <ContentMessage
          title="Detection failed"
          icon={InformationCircleIcon}
          variant="warning"
          size="lg"
        >
          {detectError}
        </ContentMessage>
      )}
      {isDetecting && (
        <div className="flex items-center justify-center py-4">
          <Spinner size="md" />
        </div>
      )}
      {rows.length > 0 && (
        <ScrollableDataTable<SkillRowData>
          data={rows}
          columns={columns}
          maxHeight="max-h-64"
          enableRowSelection={(row) =>
            isImportableSkillStatus(row.original.status)
          }
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
          getRowId={(row) => row.name}
        />
      )}
    </>
  );
}
