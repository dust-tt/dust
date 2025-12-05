import { Checkbox, Label, Spinner } from "@dust-tt/sparkle";
import type { Preference } from "@novu/js";
import { PreferenceLevel } from "@novu/js";
import type { ChannelPreference } from "@novu/react";
import cloneDeep from "lodash/cloneDeep";
import { useEffect, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useNovuClient } from "@app/hooks/useNovuClient";

const CHANNELS_TO_NAMES: Map<keyof ChannelPreference, string> = new Map([
  ["in_app", "In-App"],
  ["email", "Email"],
  ["sms", "SMS"],
  ["chat", "Chat"],
  ["push", "Push"],
]);

export const NotificationPreferences = () => {
  const sendNotification = useSendNotification();
  const [globalPreferences, setGlobalPreferences] = useState<
    Preference | undefined
  >();

  const { novuClient } = useNovuClient();

  useEffect(() => {
    void novuClient?.preferences.list().then((preferences) => {
      setGlobalPreferences(
        preferences.data?.find(
          (preference) => preference.level === PreferenceLevel.GLOBAL
        )
      );
    });
  }, [novuClient]);

  return (
    <div>
      {!globalPreferences ? (
        <Spinner />
      ) : (
        <div className="flex flex-row gap-4">
          {Array.from(CHANNELS_TO_NAMES.entries()).map(([channel, name]) =>
            globalPreferences.channels[channel] === undefined ? null : (
              <>
                <Checkbox
                  id={`${channel}-preference`}
                  key={channel}
                  checked={
                    globalPreferences.channels[channel] &&
                    globalPreferences.enabled
                  }
                  onCheckedChange={(checked) => {
                    setGlobalPreferences((prev) => {
                      if (!prev) {
                        return undefined;
                      }

                      const newPreferences = cloneDeep(prev);

                      // Modifying in place because the preference class is not just a plain object.
                      newPreferences.channels[channel] =
                        checked === true ? true : false;

                      void novuClient?.preferences
                        .update({
                          preference: newPreferences,
                          channels: newPreferences.channels,
                        })
                        .then((result) => {
                          if (result.error) {
                            sendNotification({
                              type: "error",
                              title: "Error updating notification preferences",
                              description: result.error.message,
                            });
                            setGlobalPreferences(prev);
                          }
                        })
                        .catch((error) => {
                          sendNotification({
                            type: "error",
                            title: "Error updating notification preferences",
                            description: error.message,
                          });
                          setGlobalPreferences(prev);
                        });

                      // Need to clone the preference to trigger the state update.
                      return newPreferences;
                    });
                  }}
                />
                <Label
                  htmlFor={`${channel}-preference`}
                  className="cursor-pointer"
                >
                  {name}
                </Label>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
};
