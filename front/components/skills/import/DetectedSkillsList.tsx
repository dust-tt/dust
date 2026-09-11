import type { ImportFormValues } from "@app/components/skills/import/formSchema";
import type {
  DetectedSkillStatus,
  DetectedSkillSummary,
} from "@app/lib/skill_detection";
import { isImportableSkillStatus } from "@app/lib/skill_detection";
import {
  Chip,
  ContentMessage,
  cn,
  createSelectionColumn,
  DataTable,
  InfoCircle,
  LoadingBlock,
  PuzzlePiece01,
  ScrollableDataTable,
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

const DETECTED_SKILLS_SKELETON_ROWS: SkillRowData[] = Array.from(
  { length: 3 },
  () => ({ name: "", status: "ready" })
);

function renderDetectedSkillSkeletonCell(columnId: string, rowIndex: number) {
  switch (columnId) {
    case "select":
      return <LoadingBlock className="h-4 w-4 rounded-sm" />;
    case "name":
      return (
        <div className="flex items-center gap-2">
          <LoadingBlock className="h-5 w-5 shrink-0" />
          <LoadingBlock
            className={cn(
              "h-3 max-w-full",
              ["w-32", "w-40", "w-28"][rowIndex % 3]
            )}
          />
        </div>
      );
    case "status":
      return <LoadingBlock className="h-6 w-40 max-w-full rounded-[9px]" />;
    default:
      return null;
  }
}

function getColumns(): ColumnDef<SkillRowData>[] {
  return [
    createSelectionColumn<SkillRowData>(),
    {
      id: "name",
      accessorKey: "name",
      header: "Skill name",
      cell: (info: SkillCellInfo) => (
        <DataTable.CellContent icon={PuzzlePiece01}>
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
  const skeletonColumns = useMemo(
    () =>
      columns.map((column) => {
        const skeletonColumn = {
          ...column,
          cell: (info: SkillCellInfo) =>
            renderDetectedSkillSkeletonCell(info.column.id, info.row.index),
        };
        return column.id === "select"
          ? {
              ...skeletonColumn,
              id: "select",
              header: () => <LoadingBlock className="h-4 w-4 rounded-sm" />,
            }
          : skeletonColumn;
      }),
    [columns]
  );

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
      {isDetecting && (
        <div role="status" aria-label="Detecting skills" aria-busy="true">
          <div aria-hidden="true">
            <ScrollableDataTable
              data={DETECTED_SKILLS_SKELETON_ROWS}
              columns={skeletonColumns}
              maxHeight="max-h-64"
            />
          </div>
        </div>
      )}
      {detectError && (
        <ContentMessage
          title="Detection failed"
          icon={InfoCircle}
          variant="warning"
          size="lg"
        >
          {detectError}
        </ContentMessage>
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
