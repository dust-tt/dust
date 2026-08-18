import type { PodAppImportSummary } from "@app/types/api/pod_app_archive";
import {
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";

interface PodAppImportReportDialogProps {
  report: PodAppImportSummary;
  onClose: () => void;
}

/**
 * Shown once an import lands with warnings or skipped steps. The import form is long gone by then
 * (the archive uploads and rebuilds in the background), so the issues get their own dialog rather
 * than a toast that scrolls away.
 */
export function PodAppImportReportDialog({
  report,
  onClose,
}: PodAppImportReportDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{`${report.name} imported with issues`}</DialogTitle>
        </DialogHeader>
        <DialogContainer className="flex flex-col gap-4">
          <ContentMessage variant="warning" title="Review before using the app">
            <ul className="list-disc pl-4">
              {[...report.warnings, ...report.skipped].map((issue, index) => (
                <li key={`${index}-${issue}`}>{issue}</li>
              ))}
            </ul>
          </ContentMessage>
        </DialogContainer>
        <DialogFooter
          rightButtonProps={{
            label: "Done",
            variant: "primary",
            onClick: onClose,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
