import type { ImportFormValues } from "@app/components/skills/import/formSchema";
import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import {
  type DetectedSkillStatus,
  getDuplicateDetectedSkillNames,
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
import { useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";

const STATUS_CHIP_LABEL: Record<
  Exclude<DetectedSkillStatus | "duplicate_name", "ready">,
  string
> = {
  duplicate_name: "Duplicate skill name",
  name_conflict: "Skill name already in use",
  skill_already_exists: "Override existing skill",
  invalid: "Invalid skill format",
};

interface SkillRowData {
  id: string;
  name: string;
  status: DetectedSkillStatus | "duplicate_name";
  isSelectable: boolean;
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
  const { field: selectedField, fieldState: selectedFieldState } =
    useController({
      name: "selectedSkillNames",
      control,
    });

  const duplicateNames = useMemo(
    () => getDuplicateDetectedSkillNames(detectedSkills),
    [detectedSkills]
  );

  const rows = useMemo<SkillRowData[]>(
    () =>
      detectedSkills.map((s, index) => ({
        id: `${s.name}:${index}`,
        name: s.name,
        status: duplicateNames.has(s.name) ? "duplicate_name" : s.status,
        isSelectable:
          !duplicateNames.has(s.name) && isImportableSkillStatus(s.status),
      })),
    [detectedSkills, duplicateNames]
  );

  const columns = useMemo(() => getColumns(), []);

  // Build rowSelection state from selectedSkillNames form field.
  const rowSelection = useMemo(() => {
    const selection: Record<string, boolean> = {};
    const selectedNames = new Set(selectedField.value);

    for (const row of rows) {
      if (row.isSelectable && selectedNames.has(row.name)) {
        selection[row.id] = true;
      }
    }

    return selection;
  }, [rows, selectedField.value]);

  // Sync rowSelection changes back to the form field.
  const setRowSelection = (newSelection: Record<string, boolean>) => {
    const names = rows
      .filter((row) => row.isSelectable && newSelection[row.id])
      .map((row) => row.name);
    setValue("selectedSkillNames", names, { shouldValidate: true });
  };

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
      {duplicateNames.size > 0 && (
        <ContentMessage
          title="Duplicate skill names detected"
          icon={InformationCircleIcon}
          variant="warning"
          size="lg"
        >
          Skills with the same name can't be selected for import together.
        </ContentMessage>
      )}
      {selectedFieldState.error && (
        <ContentMessage
          title="Invalid selection"
          icon={InformationCircleIcon}
          variant="warning"
          size="lg"
        >
          {selectedFieldState.error.message}
        </ContentMessage>
      )}
      {rows.length > 0 && (
        <ScrollableDataTable<SkillRowData>
          data={rows}
          columns={columns}
          maxHeight="max-h-64"
          enableRowSelection={(row) => row.original.isSelectable}
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
          getRowId={(row) => row.id}
        />
      )}
    </>
  );
}
