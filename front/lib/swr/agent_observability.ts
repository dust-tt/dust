import { useCallback } from "react";

interface ExportFeedbackCsvOptions {
  workspaceId: string;
  agentConfigurationId: string;
  days: number;
  uploadAsFile?: boolean;
}

export interface ExportFeedbackCsvResult {
  fileId: string;
  filename: string;
}

export function useExportFeedbackCsv() {
  const exportFeedbackCsv = useCallback(
    async ({
      workspaceId,
      agentConfigurationId,
      days,
    }: ExportFeedbackCsvOptions): Promise<ExportFeedbackCsvResult> => {
      const url = `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/observability/export-feedback-csv?days=${days}&uploadAsFile=true`;
      const res = await fetch(url, { method: "POST" });

      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }

      return (await res.json()) as ExportFeedbackCsvResult;
    },
    []
  );

  const downloadFeedbackCsv = useCallback(
    async ({
      workspaceId,
      agentConfigurationId,
      days,
    }: Omit<ExportFeedbackCsvOptions, "uploadAsFile">) => {
      const url = `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/observability/export-feedback-csv?days=${days}`;
      const res = await fetch(url, { method: "POST" });

      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }

      const blob = await res.blob();

      const dlUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `feedback_${agentConfigurationId}_${days}d.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(dlUrl);
    },
    []
  );

  return {
    exportFeedbackCsv,
    downloadFeedbackCsv,
  };
}
