import { TagCreationDialog } from "@app/components/assistant/TagCreationDialog";
import { TagsSuggestDialog } from "@app/components/assistant/TagsSuggestDialog";
import { EditTagDialog } from "@app/components/assistant/TagUpdateDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { useTagsUsage } from "@app/lib/swr/tags";
import type { TagTypeWithUsage } from "@app/types/tag";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  DataTable,
  Edit04,
  EmptyCTA,
  Plus,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  Stars02,
  XClose,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CellContext } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { DeleteTagDialog } from "./DeleteTagDialog";

function getColumns(tagLabelHeader: string, tagUsageHeader: string) {
  return [
    {
      accessorKey: "name",
      header: tagLabelHeader,
      cell: (info: CellContext<any, string>) => (
        <Chip label={info.row.original.name} color="info" />
      ),
    },
    {
      accessorKey: "usage",
      header: tagUsageHeader,
    },
    {
      accessorKey: "action",
      header: "",
      enableSorting: false,
      cell: (info: CellContext<any, number>) => (
        <DataTable.MoreButton menuItems={info.row.original.menuItems} />
      ),
      meta: { className: "w-14" },
    },
  ];
}

interface SuggestTagsButtonProps {
  owner: WorkspaceType;
}

const SuggestTagsButton = ({ owner }: SuggestTagsButtonProps) => {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        label={t`Suggest tags`}
        icon={Stars02}
        onClick={() => setOpen(true)}
        variant="primary"
      />
      <TagsSuggestDialog owner={owner} isOpen={open} setIsOpen={setOpen} />
    </>
  );
};
interface NewTagButtonProps {
  owner: WorkspaceType;
  empty?: boolean;
}

const NewTagButton = ({ owner, empty = false }: NewTagButtonProps) => {
  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        label={empty ? t`Add tag manually` : t`New tag`}
        icon={Plus}
        onClick={() => setOpen(true)}
        variant={empty ? "outline" : "primary"}
      />
      <TagCreationDialog
        owner={owner}
        isOpen={open}
        onTagCreated={() => {
          sendNotification({
            type: "success",
            title: t`Tag created`,
          });
        }}
        setIsOpen={setOpen}
      />
    </>
  );
};

type TagsManagerProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  owner: WorkspaceType;
};

export function TagsManager({ open, setOpen, owner }: TagsManagerProps) {
  const { t } = useLingui();
  const { isTagsLoading, tags } = useTagsUsage({ owner, disabled: !open });
  const [tagActionModal, setTagActionModal] = useState<{
    type: "delete" | "edit";
    tag: TagTypeWithUsage;
  } | null>(null);

  const columns = useMemo(() => getColumns(t`Tag label`, t`Tag usage`), [t]);

  const rows = tags.map((tag) => ({
    ...tag,
    menuItems: [
      {
        icon: Edit04,
        label: t`Edit tag`,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          setTagActionModal({ type: "edit", tag });
        },
        kind: "item",
      },
      {
        icon: XClose,
        label: t`Delete tag`,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          setTagActionModal({ type: "delete", tag });
        },
        variant: "warning",
        kind: "item",
      },
    ],
  }));

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent size="lg">
          <SheetHeader>
            <SheetTitle>
              <Trans>Managing tags</Trans>
            </SheetTitle>
          </SheetHeader>

          <SheetContainer>
            {isTagsLoading && (
              <div className="flex flex-row items-center">
                <Spinner />
              </div>
            )}
            {rows.length > 0 && !isTagsLoading && (
              <>
                <div className="flex w-full flex-row justify-end">
                  <NewTagButton owner={owner} />
                </div>
                <DataTable data={rows} columns={columns} />
              </>
            )}
            {rows.length <= 1 && !isTagsLoading && (
              // We show the emptyCTA if there's only one tag, which should be the default "Company" tag
              <EmptyCTA
                action={
                  <div className="flex flex-row gap-2">
                    <SuggestTagsButton owner={owner} />
                    <NewTagButton owner={owner} empty />
                  </div>
                }
                message={t`No tags have been created yet. Let AI suggest tags for your agents, or add manually.`}
              />
            )}
          </SheetContainer>
        </SheetContent>
      </Sheet>

      {tagActionModal != null && tagActionModal.type === "delete" && (
        <DeleteTagDialog
          owner={owner}
          open
          setOpen={() => setTagActionModal(null)}
          tag={tagActionModal.tag}
        />
      )}
      {tagActionModal !== null && tagActionModal.type === "edit" && (
        <EditTagDialog
          owner={owner}
          tag={tagActionModal.tag}
          isOpen
          setIsOpen={() => setTagActionModal(null)}
        />
      )}
    </>
  );
}
