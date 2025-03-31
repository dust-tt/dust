import { SliderToggle, Spinner } from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import React, { useState } from "react";
import { useSWRConfig } from "swr/_internal";

import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { KillSwitchType } from "@app/lib/poke/types";
import { usePokeKillSwitches } from "@app/poke/swr/kill";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

const KillPage = () => {
  const { killSwitches, isKillSwitchesLoading } = usePokeKillSwitches();
  const [loading, setLoading] = useState(false);
  const { mutate } = useSWRConfig();
  const sendNotification = useSendNotification();

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
    retrieval_action: {
      title: "Retrieval Action",
      description: "Disable retrieval action",
    },
  };

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

    const res = await fetch(`/api/poke/kill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enabled: !isEnabled,
        type: killSwitch,
      }),
    });

    if (res.ok) {
      await mutate("/api/poke/kill");
      sendNotification({
        title: "Kill switch updated",
        description: `Kill switch ${killSwitch} updated`,
        type: "success",
      });
    } else {
      const errorData = await res.json();
      console.error(errorData);
      sendNotification({
        title: "Error updating kill switch",
        description: `Error: ${errorData.error.message}`,
        type: "error",
      });
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
};

KillPage.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Kill Switches">{page}</PokeLayout>;
};

export default KillPage;
