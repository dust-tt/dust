import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";

export function WebhookSourceJiraDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  const remoteMetadata = webhookSource.remoteMetadata;
  const projects =
    (remoteMetadata?.projects as Array<{ key: string; name: string }>) || [];

  return (
    <div className="space-y-2">
      <div className="text-element-900 text-sm font-medium">
        Connected Projects:
      </div>
      <div className="space-y-1">
        {projects.map((project) => (
          <div key={project.key} className="text-element-700 text-sm">
            {project.name} ({project.key})
          </div>
        ))}
      </div>
      {remoteMetadata?.siteUrl && (
        <div className="text-element-600 text-sm">
          Site: {remoteMetadata.siteUrl}
        </div>
      )}
    </div>
  );
}
