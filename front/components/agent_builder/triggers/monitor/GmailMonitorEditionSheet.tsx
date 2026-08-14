import { TriggerPodSelector } from "@app/components/agent_builder/triggers/TriggerPodSelector";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Input,
  Label,
  Separator,
  SliderToggle,
  TextArea,
} from "@dust-tt/sparkle";
import { useController, useFormContext } from "react-hook-form";

export function GmailMonitorEditionSheetContent({
  owner,
  isEditor,
}: {
  owner: LightWorkspaceType;
  isEditor: boolean;
}) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const name = useController({ control, name: "monitor.name" });
  const status = useController({ control, name: "monitor.status" });
  const query = useController({ control, name: "monitor.q" });
  const maxResults = useController({ control, name: "monitor.maxResults" });
  const interval = useController({ control, name: "monitor.intervalMinutes" });
  const prompt = useController({ control, name: "monitor.customPrompt" });
  const space = useController({ control, name: "monitor.spaceId" });
  const enabled = status.field.value === "enabled";

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <div className="flex-1 space-y-1">
          <Label>Name</Label>
          <Input disabled={!isEditor} {...name.field} />
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <SliderToggle
            disabled={!isEditor}
            selected={enabled}
            onClick={() =>
              status.field.onChange(enabled ? "disabled" : "enabled")
            }
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Gmail search query</Label>
        <p className="text-sm text-muted-foreground">
          Use Gmail search syntax, for example{" "}
          <code>label:inbox is:unread</code>. Leave blank to monitor all recent
          messages.
        </p>
        <Input
          disabled={!isEditor}
          placeholder="label:inbox"
          {...query.field}
          value={query.field.value ?? ""}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
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
        <div className="space-y-1">
          <Label>Messages to inspect</Label>
          <Input
            disabled={!isEditor}
            type="number"
            min={1}
            max={50}
            {...maxResults.field}
            value={maxResults.field.value}
            onChange={(event) =>
              maxResults.field.onChange(Number(event.target.value))
            }
          />
        </div>
      </div>
      <Separator />
      <div className="space-y-1">
        <Label>What should the agent do?</Label>
        <TextArea
          disabled={!isEditor}
          minRows={4}
          placeholder="Summarize any new customer emails and flag urgent requests."
          {...prompt.field}
          value={prompt.field.value ?? ""}
        />
      </div>
      <Separator />
      <div className="space-y-1">
        <Label>Where to create this conversation? (optional)</Label>
        <TriggerPodSelector
          owner={owner}
          value={space.field.value}
          onChange={space.field.onChange}
          disabled={!isEditor}
        />
      </div>
    </div>
  );
}
