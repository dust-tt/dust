import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import type { WorkspaceType } from "@app/types/user";
import { Button, Download01 } from "@dust-tt/sparkle";

interface MemberConsumptionExportButtonProps {
  owner: WorkspaceType;
  userId: string;
}

// Downloads a ZIP with one CSV per itemizable consumption source
// (Elasticsearch and Metronome), each listing the rows behind the total shown in
// the "Consumed (ES / RL / MT)" column for the current billing cycle. The RL
// counter has no file: Redis holds a single counter, with nothing to itemize.
export function MemberConsumptionExportButton({
  owner,
  userId,
}: MemberConsumptionExportButtonProps) {
  const { isDownloading, handleDownload } = useDownloadCsv({
    url: `/api/poke/workspaces/${owner.sId}/credits/consumption-export?userId=${userId}`,
    filename: `dust_consumption_${owner.sId}_${userId}.zip`,
  });

  return (
    <Button
      icon={Download01}
      variant="ghost"
      size="xs"
      tooltip="Download ES / MT consumption details (ZIP)"
      onClick={handleDownload}
      isLoading={isDownloading}
    />
  );
}
