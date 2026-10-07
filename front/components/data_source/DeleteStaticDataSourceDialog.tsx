import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatList } from "@app/lib/i18n/format";
import { useDataSourceUsage } from "@app/lib/swr/data_sources";
import type { DataSourceType } from "@app/types/data_source";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

interface DeleteStaticDataSourceDialogProps {
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
  handleDelete: () => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteStaticDataSourceDialog({
  owner,
  dataSource,
  handleDelete,
  isOpen,
  onClose,
}: DeleteStaticDataSourceDialogProps) {
  const { t } = useLingui();
  const [isLoading, setIsLoading] = useState(false);
  const { usage, isUsageLoading, isUsageError } = useDataSourceUsage({
    owner,
    dataSource,
  });

  const onDelete = async () => {
    setIsLoading(true);
    await handleDelete();
    setIsLoading(false);
    onClose();
  };
  const name = getDisplayNameForDataSource(dataSource);

  const message = useMemo(() => {
    if (isUsageLoading) {
      return t`Checking usage...`;
    }
    if (isUsageError) {
      return t`Failed to check usage.`;
    }
    if (!usage) {
      return t`No usage data available.`;
    }
    if (usage.count > 0) {
      const agentCount = usage.count;
      const agentNames = formatList(
        usage.agents.map((a) => a.name),
        { type: "conjunction" },
        getActiveLocale()
      );
      return t`${plural(agentCount, {
        one: `# agent currently uses "${name}": ${agentNames}.`,
        other: `# agents currently use "${name}": ${agentNames}.`,
      })}`;
    }
    return t`No agents are using "${name}".`;
  }, [isUsageLoading, isUsageError, usage, name, t]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Confirm deletion</Trans>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer>
              {message}
              <b>
                <Trans>Are you sure you want to delete?</Trans>
              </b>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: t`Cancel`,
                variant: "outline",
              }}
              rightButtonProps={{
                label: t`Delete`,
                variant: "warning",
                onClick: async () => {
                  void onDelete();
                },
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
