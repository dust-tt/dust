import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { useBuilderContext } from "@app/components/shared/useBuilderContext";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { Chip, ContentMessage } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";

interface MCPServerInfoPageProps {
  infoMCPServerView: MCPServerViewType;
}

export function MCPServerInfoPage({
  infoMCPServerView,
}: MCPServerInfoPageProps) {
  const { t } = useLingui();
  const { owner } = useBuilderContext();
  const nbTools = (infoMCPServerView.server.tools ?? []).length;

  return (
    <div className="flex h-full flex-col space-y-6 pt-3">
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">
              <Trans>Available tools</Trans>
            </h3>
            <Chip
              size="xs"
              color="info"
              label={t`${plural(nbTools, { one: "# tool", other: "# tools" })}`}
            />
          </div>

          {nbTools > 0 ? (
            <div className="flex flex-col gap-4">
              <span className="text-md text-muted-foreground">
                <Plural
                  value={nbTools}
                  one="This tool will be available to your agent during conversations and can be configured with different permission levels:"
                  other="These tools will be available to your agent during conversations and can be configured with different permission levels:"
                />
              </span>
              <ToolsList
                owner={owner}
                mcpServerView={infoMCPServerView}
                disableUpdates
              />
            </div>
          ) : (
            <ContentMessage variant="primary" size="sm">
              <Trans>No tools are currently available for this server.</Trans>
            </ContentMessage>
          )}
        </div>
      </div>
    </div>
  );
}
