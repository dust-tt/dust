import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getMonitorableMCPTools } from "@app/lib/triggers/monitorable_mcp_servers";
import { Input, Label, SliderToggle, TextArea } from "@dust-tt/sparkle";
import { useController, useFormContext } from "react-hook-form";

export function MCPToolMonitorEditionSheetContent({
  isEditor,
  mcpServerView,
}: {
  isEditor: boolean;
  mcpServerView: MCPServerViewType | null;
}) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const name = useController({ control, name: "mcpMonitor.name" });
  const toolName = useController({ control, name: "mcpMonitor.toolName" });
  const inputJson = useController({ control, name: "mcpMonitor.inputJson" });
  const interval = useController({
    control,
    name: "mcpMonitor.intervalMinutes",
  });
  const prompt = useController({ control, name: "mcpMonitor.customPrompt" });
  const status = useController({ control, name: "mcpMonitor.status" });
  const tools = mcpServerView ? getMonitorableMCPTools(mcpServerView) : [];
  return (
    <div className="space-y-5">
      <div className="flex gap-4">
        <div className="flex-1">
          <Label>Name</Label>
          <Input disabled={!isEditor} {...name.field} />
        </div>
        <SliderToggle
          disabled={!isEditor}
          selected={status.field.value === "enabled"}
          onClick={() =>
            status.field.onChange(
              status.field.value === "enabled" ? "disabled" : "enabled"
            )
          }
        />
      </div>
      <div>
        <Label>MCP server</Label>
        <Input
          disabled
          value={mcpServerView?.name ?? mcpServerView?.server.name ?? ""}
        />
      </div>
      <div>
        <Label>Tool name</Label>
        <select
          disabled={!isEditor}
          className="w-full rounded border p-2"
          {...toolName.field}
        >
          {tools.map((tool) => (
            <option key={tool.name} value={tool.name}>
              {tool.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Tool arguments (JSON)</Label>
        <TextArea
          disabled={!isEditor}
          minRows={5}
          placeholder='{"state":"open"}'
          {...inputJson.field}
        />
      </div>
      <div>
        <Label>Check every</Label>
        <select
          disabled={!isEditor}
          className="w-full rounded border p-2"
          {...interval.field}
          onChange={(event) =>
            interval.field.onChange(Number(event.target.value))
          }
        >
          {[2, 15, 60, 360, 1440].map((value) => (
            <option key={value} value={value}>
              {value < 60
                ? `${value} minutes`
                : value < 1440
                  ? `${value / 60} hours`
                  : "day"}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>What should the agent do?</Label>
        <TextArea
          disabled={!isEditor}
          minRows={4}
          {...prompt.field}
          value={prompt.field.value ?? ""}
        />
      </div>
    </div>
  );
}
