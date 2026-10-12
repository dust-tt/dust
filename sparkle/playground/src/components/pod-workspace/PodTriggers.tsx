import {
  Button,
  Clock,
  Icon,
  Input,
  Plus,
  SliderToggle,
  TextArea,
  Zap,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { triggerSchema, type WorkspaceState } from "./engine";
import type {
  PodWorkspaceView,
  TriggerDefinition,
  WorkspaceFile,
} from "./model";
import {
  podTriggers,
  runTrigger,
  saveTrigger,
  toggleTrigger,
  triggerDescription,
} from "./triggers";

type Change = (update: (state: WorkspaceState) => WorkspaceState) => void;

export function PodTriggers({
  state,
  podId,
  onOpen,
  onChange,
}: {
  state: WorkspaceState;
  podId: string;
  onOpen: (view: PodWorkspaceView) => void;
  onChange: Change;
}) {
  const files = podTriggers(state, podId);
  return (
    <section aria-label="Triggers" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Triggers</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {files.filter((file) => file.trigger?.enabled).length} enabled ·{" "}
            {files.length} total
          </p>
        </div>
        {
          <Button
            label="New trigger"
            icon={Plus}
            variant="highlight"
            onClick={() => onOpen({ kind: "trigger-editor" })}
          />
        }
      </div>
      <div className="divide-y divide-border">
        {files.map((file) => {
          const trigger = file.trigger;
          if (!trigger) {
            return null;
          }
          const agent = state.files.find((item) => item.id === trigger.agentId);
          return (
            <div
              key={file.id}
              className="flex items-start gap-3 py-4 first:pt-0"
            >
              <Icon
                visual={trigger.kind === "event" ? Zap : Clock}
                size="sm"
                className="mt-1 shrink-0 text-muted-foreground"
              />
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  onOpen({ kind: "trigger-editor", fileId: file.id })
                }
              >
                <span className="block text-sm font-medium">{file.name}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {triggerDescription(trigger, state.files)}
                </span>
                {
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {agent?.name} · {trigger.enabled ? "Enabled" : "Paused"}
                  </span>
                }
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={trigger.enabled}
                aria-label={`Enable ${file.name}`}
                className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() =>
                  onChange((current) => toggleTrigger(current, file.id))
                }
              >
                <SliderToggle selected={trigger.enabled} />
              </button>
            </div>
          );
        })}
        {!files.length && (
          <p className="py-4 text-sm text-muted-foreground">No triggers yet.</p>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Each trigger starts an agent conversation with this pod’s context. Runs
        are shared with pod members.
      </p>
    </section>
  );
}

const formSchema = triggerSchema.extend({
  name: z.string().trim().min(1, "Give this trigger a name."),
});
type Values = TriggerDefinition & { name: string };

export function TriggerEditor({
  state,
  podId,
  file,
  onChange,
  onClose,
  onOpen,
}: {
  state: WorkspaceState;
  podId: string;
  file?: WorkspaceFile;
  onChange: Change;
  onClose: () => void;
  onOpen: (view: PodWorkspaceView) => void;
}) {
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: file?.name ?? "",
      podId,
      enabled: true,
      kind: "event",
      agentId: state.configurations[podId].defaultAgentId,
      prompt: "",
      folderId: podId === "voice-of-customer" ? "calls" : "",
      cadence: "weekly",
      time: "09:00",
      timezone: "Europe/Paris",
      ...file?.trigger,
    },
  });
  const kind = watch("kind");
  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
  const latest = state.runs.find(
    (run) =>
      run.podId === podId &&
      (run.triggerId === file?.id ||
        run.reason === file?.name ||
        (file?.id === "voc-trigger" &&
          run.reason === "New call in Customer calls"))
  );
  return (
    <form
      aria-label={file ? "Edit trigger" : "New trigger"}
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit(({ name, ...trigger }) => {
        onChange((current) => saveTrigger(current, name, trigger, file?.id));
        onClose();
      })}
    >
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <Input
            label="Name"
            id="name"
            {...register("name")}
            placeholder="Weekly customer review"
            message={errors.name?.message}
            messageStatus={errors.name ? "error" : "default"}
          />
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">When</h2>
            <label className="flex flex-col gap-2 text-sm">
              Trigger type
              <select className={inputClass} {...register("kind")}>
                <option value="event">A file is added</option>
                <option value="schedule">On a schedule</option>
              </select>
            </label>
            {kind === "event" ? (
              <label className="flex flex-col gap-2 text-sm">
                Watch folder
                <select
                  className={inputClass}
                  {...register("folderId")}
                  required
                >
                  <option value="">Choose a folder</option>
                  {state.files
                    .filter(
                      (item) =>
                        item.kind === "folder" &&
                        item.id !== "pods" &&
                        !item.id.startsWith("pod:")
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.scope} /{" "}
                        {item.location ? `${item.location} / ` : ""}
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-2 text-sm">
                  Repeat
                  <select className={inputClass} {...register("cadence")}>
                    <option value="weekly">Every Monday</option>
                    <option value="daily">Every day</option>
                  </select>
                </label>
                <Input
                  label="Time"
                  id="time"
                  type="time"
                  {...register("time")}
                  message={errors.time?.message}
                  messageStatus={errors.time ? "error" : "default"}
                />
                <label className="col-span-2 flex flex-col gap-2 text-sm">
                  Time zone
                  <select className={inputClass} {...register("timezone")}>
                    <option>Europe/Paris</option>
                    <option>UTC</option>
                    <option>America/New_York</option>
                  </select>
                </label>
              </div>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Start a conversation</h2>
            <label className="flex flex-col gap-2 text-sm">
              Agent
              <select className={inputClass} {...register("agentId")}>
                {state.files
                  .filter((item) => item.kind === "agent")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Message
              <TextArea
                {...register("prompt")}
                minRows={4}
                placeholder="What should the agent do?"
              />
            </label>
            {errors.prompt && (
              <p role="alert" className="text-sm text-warning-600">
                {errors.prompt.message}
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Uses this pod’s sources. Only files available to everyone in the
              conversation can be used.
            </p>
          </section>
          {file && (
            <section className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <div>
                <h2 className="text-sm font-semibold">Last run</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {latest
                    ? new Date(latest.at).toLocaleString()
                    : "No runs yet"}
                </p>
              </div>
              {latest && (
                <Button
                  type="button"
                  label="Open conversation"
                  variant="ghost"
                  onClick={() =>
                    onOpen({ kind: "file", fileId: latest.conversationId })
                  }
                />
              )}
              <Button
                type="button"
                label="Run now"
                variant="outline"
                disabled={isDirty || !file.trigger?.enabled}
                onClick={() =>
                  onChange((current) => runTrigger(current, file.id))
                }
              />
            </section>
          )}
        </div>
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border p-4">
        <Button
          type="button"
          label="Cancel"
          variant="outline"
          onClick={onClose}
        />
        <Button
          label={file ? "Save changes" : "Create trigger"}
          variant="highlight"
          type="submit"
        />
      </div>
    </form>
  );
}
