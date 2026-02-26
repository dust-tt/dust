import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { useSendNotification } from "@app/hooks/useNotification";
import type { KillSwitchType } from "@app/lib/poke/types";
import { useFetcher } from "@app/lib/swr/swr";
import { usePokeKillSwitches } from "@app/poke/swr/kill";
import { isAPIErrorResponse } from "@app/types/error";
import { SliderToggle, Spinner } from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useState } from "react";
import { useSWRConfig } from "swr/_internal";

const killSwitchMap: Record<
  KillSwitchType,
  {
    title: string;
    description: string;
  }
> = {
  save_agent_configurations: {
    title: "Agent Configurations",
    description: "Disable saving of agent configurations",
  },
  save_data_source_views: {
    title: "Data Source Views",
    description: "Disable saving of data source views",
  },
};

export function KillPage() {
  useSetPokePageTitle("Kill Switches");

  const { killSwitches, isKillSwitchesLoading } = usePokeKillSwitches();
  const [loading, setLoading] = useState(false);
  const { mutate } = useSWRConfig();
  const { fetcherWithBody } = useFetcher();
  const sendNotification = useSendNotification();

  async function toggleKillSwitch(killSwitch: KillSwitchType) {
    if (loading) {
      return;
    }

    setLoading(true);

    const isEnabled = killSwitches.includes(killSwitch);

    if (!isEnabled) {
      if (
        !window.confirm(
          `Are you sure you want to enable the ${killSwitchMap[killSwitch].title} kill switch?`
        )
      ) {
        setLoading(false);
        return;
      }
    }

    try {
      await fetcherWithBody([
        `/api/poke/kill`,
        {
          enabled: !isEnabled,
          type: killSwitch,
        },
        "POST",
      ]);
      await mutate("/api/poke/kill");
      sendNotification({
        title: "Kill switch updated",
        description: `Kill switch ${killSwitch} updated`,
        type: "success",
      });
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          title: "Error updating kill switch",
          description: `Error: ${e.error.message}`,
          type: "error",
        });
      } else {
        sendNotification({
          title: "Error updating kill switch",
          description: "An error occurred",
          type: "error",
        });
      }
    }

    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="py-12">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            System Kill Switches
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Control critical system functionalities
          </p>
        </div>

        {isKillSwitchesLoading ? (
          <Spinner />
        ) : (
          <div className="mx-auto mt-12 max-w-xl">
            <div className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
              {Object.entries(killSwitchMap).map(([key, value]) => {
                return (
                  <div
                    className="flex items-center justify-between border-b border-gray-100 py-4"
                    key={key}
                  >
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">
                        {value.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {value.description}
                      </p>
                    </div>
                    <SliderToggle
                      onClick={() => toggleKillSwitch(key as KillSwitchType)}
                      selected={killSwitches.includes(key as KillSwitchType)}
                      disabled={loading}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
