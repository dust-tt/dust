import { ResponseFormatRows } from "./ResponseFormatSection";
import { BuilderSection, FieldGroup } from "./SectionContainer";
import { CostManagementRows } from "./SettingsSection";

export function AdvancedSection({
  modelId,
  responseFormat,
  onResponseFormatChange,
  ignoreCreditThreshold,
  onIgnoreCreditThresholdChange,
  isManager,
}: {
  modelId: string;
  responseFormat: string;
  onResponseFormatChange: (schema: string) => void;
  ignoreCreditThreshold: boolean;
  onIgnoreCreditThresholdChange: (value: boolean) => void;
  isManager: boolean;
}) {
  const hasSchema = responseFormat.trim().length > 0;
  const summary = [
    hasSchema ? "JSON schema" : "Text response",
    isManager
      ? ignoreCreditThreshold
        ? "credit alert ignored"
        : "pauses at credit alert"
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <BuilderSection
      title="Advanced"
      description="Response format and credit checkpoint behavior."
      collapsible
      defaultOpen={hasSchema || ignoreCreditThreshold}
      summary={summary}
    >
      <FieldGroup>
        <ResponseFormatRows
          modelId={modelId}
          responseFormat={responseFormat}
          onResponseFormatChange={onResponseFormatChange}
        />
        <CostManagementRows
          ignoreCreditThreshold={ignoreCreditThreshold}
          onIgnoreCreditThresholdChange={onIgnoreCreditThresholdChange}
          isManager={isManager}
        />
      </FieldGroup>
    </BuilderSection>
  );
}
