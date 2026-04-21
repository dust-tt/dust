import { cn } from "@app/components/poke/shadcn/lib/utils";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { KILL_SWITCH_TYPES, type KillSwitchType } from "@app/lib/poke/types";
import { usePokeKillSwitches } from "@app/poke/swr/kill";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ActionFireIcon,
  AnthropicLogo,
  ArrowPathIcon,
  BoltIcon,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  OpenaiLogo,
  SliderToggle,
  Spinner,
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
    icon: Cog6ToothIcon,
  },
  save_data_source_views: {
    title: "Data Source Views",
    description: "Disable saving of data source views.",
    icon: CloudArrowLeftRightIcon,
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
    icon: ActionFireIcon,
  },
  global_dust_agents_fallback: {
    title: "Dust Agents Fallback Provider",
    description:
      "Force Dust and Deep Dive agents to use non-Anthropic providers.",
    note: "Use only when the latest Sonnet or Opus models are down.",
    icon: ArrowPathIcon,
  },
};

export function KillPage() {
  useDocumentTitle("Poke - Kill Switches");

  const { killSwitches, isKillSwitchesLoading, mutateKillSwitches } =
    usePokeKillSwitches();
  const [updatingKillSwitch, setUpdatingKillSwitch] =
    useState<KillSwitchType | null>(null);
  const sendNotification = useSendNotification();
  const enabledKillSwitches = new Set(killSwitches);

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

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-foreground dark:text-foreground-night">
          <BoltIcon className="h-4 w-4 text-muted-foreground dark:text-muted-foreground-night" />
          <span>Kill switches</span>
        </h1>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Control critical system functionality.
        </p>
      </header>

      {isKillSwitchesLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <section
          className={cn(
            "mt-6 rounded-2xl border border-border",
            "bg-background shadow-sm dark:border-border-night dark:bg-background-night"
          )}
        >
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
                  index > 0 && "border-t border-border dark:border-border-night"
                )}
              >
                <div className="space-y-1">
                  <h2 className="flex items-center gap-3 text-sm font-medium text-foreground dark:text-foreground-night">
                    <Icon className="h-4 w-4 text-foreground dark:text-foreground-night" />
                    <span>{title}</span>
                  </h2>

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
        </section>
      )}
    </main>
  );
}
