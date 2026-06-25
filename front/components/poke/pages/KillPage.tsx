import { cn } from "@app/components/poke/shadcn/lib/utils";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { KILL_SWITCH_TYPES, type KillSwitchType } from "@app/lib/poke/types";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { usePokeKillSwitches } from "@app/poke/swr/kill";
import {
  usePokeSandboxKillImages,
  useRequestSandboxKill,
} from "@app/poke/swr/sandbox_kill";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  AlertCircle,
  AnthropicLogo,
  Button,
  CloudArrowLeftRight,
  CreditCard01,
  Fire,
  OpenaiLogo,
  RefreshCw02,
  Settings01,
  SliderToggle,
  Spinner,
  Trash01,
  Zap,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";

interface KillSwitchDefinition {
  title: string;
  description: string;
  note?: string;
  icon: ComponentType<{ className?: string }>;
}

const KILL_SWITCH_DEFINITIONS: Record<KillSwitchType, KillSwitchDefinition> = {
  save_agent_configurations: {
    title: "Agent Configurations",
    description: "Disable saving of agent configurations.",
    icon: Settings01,
  },
  save_data_source_views: {
    title: "Data Source Views",
    description: "Disable saving of data source views.",
    icon: CloudArrowLeftRight,
  },
  global_blacklist_anthropic: {
    title: "Anthropic Models",
    description: "Disable Anthropic models in all agents.",
    icon: AnthropicLogo,
  },
  global_blacklist_openai: {
    title: "OpenAI Models",
    description: "Disable OpenAI models in all agents.",
    icon: OpenaiLogo,
  },
  global_disable_firecrawl: {
    title: "Firecrawl",
    description:
      "Disable Firecrawl for web browsing and use Spider.cloud instead.",
    icon: Fire,
  },
  global_dust_agents_fallback: {
    title: "Dust Agents Fallback Provider",
    description:
      "Force Dust and Deep Dive agents to use non-Anthropic providers.",
    note: "Use only when the latest Sonnet or Opus models are down.",
    icon: RefreshCw02,
  },
  global_disable_metronome_billing: {
    title: "Metronome Billing",
    description:
      "Disable Metronome billing globally and fall back to legacy Stripe subscriptions.",
    note: "Workspaces with the `legacy_billing` feature flag are always on legacy billing regardless of this switch.",
    icon: CreditCard01,
  },
};

const PANEL_HEADING_CLASSES =
  "flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-foreground dark:text-foreground-night";
const PANEL_ICON_CLASSES =
  "h-4 w-4 text-muted-foreground dark:text-muted-foreground-night";
const PANEL_DESCRIPTION_CLASSES =
  "text-sm text-muted-foreground dark:text-muted-foreground-night";
const PANEL_SECTION_CLASSES = cn(
  "mt-6 rounded-2xl border border-border",
  "bg-background shadow-sm dark:border-border-night dark:bg-background-night"
);

type SandboxKillRequestKey = string;

function sandboxKillKey(
  baseImage: string,
  version?: string
): SandboxKillRequestKey {
  return `${baseImage}|${version ?? ""}`;
}

export function KillPage() {
  usePokePageMetadata({ name: "Kill Switches" });

  const { killSwitches, isKillSwitchesLoading, mutateKillSwitches } =
    usePokeKillSwitches();
  const [updatingKillSwitch, setUpdatingKillSwitch] =
    useState<KillSwitchType | null>(null);
  const sendNotification = useSendNotification();
  const enabledKillSwitches = new Set(killSwitches);

  const { images, isImagesLoading } = usePokeSandboxKillImages();
  const requestSandboxKill = useRequestSandboxKill();
  const [submittingSandboxKill, setSubmittingSandboxKill] =
    useState<SandboxKillRequestKey | null>(null);

  async function updateKillSwitch(
    killSwitch: KillSwitchType,
    enabled: boolean
  ): Promise<void> {
    if (updatingKillSwitch) {
      return;
    }

    if (
      enabled &&
      !window.confirm(
        `Enable "${KILL_SWITCH_DEFINITIONS[killSwitch].title}" kill switch?`
      )
    ) {
      return;
    }

    setUpdatingKillSwitch(killSwitch);

    try {
      const res = await clientFetch("/api/poke/kill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled,
          type: killSwitch,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        sendNotification({
          title: "Error updating kill switch",
          description: errorData.error?.message ?? "Unknown error",
          type: "error",
        });
        return;
      }

      await mutateKillSwitches();
      sendNotification({
        title: "Kill switch updated",
        description: `${KILL_SWITCH_DEFINITIONS[killSwitch].title} ${
          enabled ? "enabled" : "disabled"
        }.`,
        type: "success",
      });
    } catch (error) {
      sendNotification({
        title: "Error updating kill switch",
        description: normalizeError(error).message,
        type: "error",
      });
    } finally {
      setUpdatingKillSwitch(null);
    }
  }

  async function submitSandboxKillRequest(
    baseImage: string,
    version: string | undefined,
    confirmMessage: string
  ): Promise<void> {
    if (submittingSandboxKill) {
      return;
    }
    if (!window.confirm(confirmMessage)) {
      return;
    }

    const key = sandboxKillKey(baseImage, version);
    setSubmittingSandboxKill(key);
    try {
      await requestSandboxKill({ baseImage, version });
    } finally {
      setSubmittingSandboxKill(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      <section className="space-y-2">
        <h2 className={PANEL_HEADING_CLASSES}>
          <Zap className={PANEL_ICON_CLASSES} />
          <span>Kill switches</span>
        </h2>
        <p className={PANEL_DESCRIPTION_CLASSES}>
          Control critical system functionality.
        </p>

        {isKillSwitchesLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className={PANEL_SECTION_CLASSES}>
            {KILL_SWITCH_TYPES.map((type, index) => {
              const {
                title,
                description,
                note,
                icon: Icon,
              } = KILL_SWITCH_DEFINITIONS[type];

              const isEnabled = enabledKillSwitches.has(type);
              const isUpdating = updatingKillSwitch === type;

              return (
                <div
                  key={type}
                  className={cn(
                    "grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                    index > 0 &&
                      "border-t border-border dark:border-border-night"
                  )}
                >
                  <div className="space-y-1">
                    <h3 className="flex items-center gap-3 text-sm font-medium text-foreground dark:text-foreground-night">
                      <Icon className="h-4 w-4 text-foreground dark:text-foreground-night" />
                      <span>{title}</span>
                    </h3>

                    <p className="text-sm leading-6 text-muted-foreground dark:text-muted-foreground-night">
                      {description}
                    </p>

                    {note && (
                      <p className="text-xs leading-5 text-muted-foreground dark:text-muted-foreground-night">
                        {note}
                      </p>
                    )}
                  </div>

                  <div className="flex h-7 w-10 items-center justify-center">
                    {isUpdating ? (
                      <Spinner size="xs" />
                    ) : (
                      <SliderToggle
                        disabled={updatingKillSwitch !== null}
                        onClick={() => void updateKillSwitch(type, !isEnabled)}
                        selected={isEnabled}
                        size="xs"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className={PANEL_HEADING_CLASSES}>
          <Trash01 className={PANEL_ICON_CLASSES} />
          <span>Sandbox Kill Requester</span>
        </h2>
        <p className={PANEL_DESCRIPTION_CLASSES}>
          Mark running sandboxes for immediate reaping. The reaper or the next
          bash invocation will destroy them and recreate fresh ones from the
          current image.
        </p>

        {isImagesLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : images.length === 0 ? (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-background p-5 text-sm text-muted-foreground dark:border-border-night dark:bg-background-night dark:text-muted-foreground-night">
            <AlertCircle className="h-4 w-4" />
            <span>No registered sandbox images found.</span>
          </div>
        ) : (
          <div className={PANEL_SECTION_CLASSES}>
            {images.map(({ baseImage, version }, index) => {
              const olderKey = sandboxKillKey(baseImage, version);
              const allKey = sandboxKillKey(baseImage, undefined);
              const isOlderSubmitting = submittingSandboxKill === olderKey;
              const isAllSubmitting = submittingSandboxKill === allKey;

              return (
                <div
                  key={olderKey}
                  className={cn(
                    "grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                    index > 0 &&
                      "border-t border-border dark:border-border-night"
                  )}
                >
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-foreground dark:text-foreground-night">
                      {baseImage}
                      <span className="text-muted-foreground dark:text-muted-foreground-night">
                        :{version}
                      </span>
                    </h3>
                    <p className="text-xs leading-5 text-muted-foreground dark:text-muted-foreground-night">
                      Current registered version.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      label="Kill older versions"
                      disabled={submittingSandboxKill !== null}
                      isLoading={isOlderSubmitting}
                      onClick={() =>
                        void submitSandboxKillRequest(
                          baseImage,
                          version,
                          `Request kill of all "${baseImage}" sandboxes whose version differs from "${version}"?`
                        )
                      }
                    />
                    <Button
                      variant="warning"
                      size="sm"
                      label="Kill all versions"
                      disabled={submittingSandboxKill !== null}
                      isLoading={isAllSubmitting}
                      onClick={() =>
                        void submitSandboxKillRequest(
                          baseImage,
                          undefined,
                          `Request kill of ALL "${baseImage}" sandboxes (every version)?`
                        )
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
