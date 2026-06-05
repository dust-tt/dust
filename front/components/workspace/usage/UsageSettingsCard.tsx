import {
  useDefaultUserSpendLimit,
  useUpdateDefaultUserSpendLimit,
} from "@app/lib/swr/usage_settings";
import {
  MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
} from "@app/types/credits";
import { Input, Page, SettingsList } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface UsageSettingsCardProps {
  workspaceId: string;
}

export function UsageSettingsCard({ workspaceId }: UsageSettingsCardProps) {
  const { defaultUserSpendLimit, isDefaultUserSpendLimitLoading } =
    useDefaultUserSpendLimit({ workspaceId });
  const { doUpdateDefaultUserSpendLimit } = useUpdateDefaultUserSpendLimit({
    workspaceId,
  });

  const [defaultLimitInput, setDefaultLimitInput] = useState<string>("");
  const [isSavingLimit, setIsSavingLimit] = useState(false);

  useEffect(() => {
    if (defaultUserSpendLimit?.awuCredits !== undefined) {
      setDefaultLimitInput(
        defaultUserSpendLimit.awuCredits !== null
          ? String(defaultUserSpendLimit.awuCredits)
          : ""
      );
    }
  }, [defaultUserSpendLimit]);

  const handleCommitDefaultLimit = async () => {
    const parsed = Number(defaultLimitInput);
    const current = defaultUserSpendLimit?.awuCredits ?? null;
    if (
      !Number.isInteger(parsed) ||
      parsed < MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS ||
      parsed > MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS ||
      parsed === current
    ) {
      setDefaultLimitInput(current !== null ? String(current) : "");
      return;
    }
    setIsSavingLimit(true);
    try {
      const result = await doUpdateDefaultUserSpendLimit(parsed);
      if (!result) {
        setDefaultLimitInput(current !== null ? String(current) : "");
      }
    } finally {
      setIsSavingLimit(false);
    }
  };

  const isDefaultLimitInputDisabled =
    isSavingLimit || isDefaultUserSpendLimitLoading;

  return (
    <Page.Vertical gap="sm" align="stretch">
      <span className="heading-2xl text-foreground dark:text-foreground-night">
        Settings
      </span>
      <SettingsList>
        <SettingsList.Row
          title="Default pool credit limit"
          description="Define the pool credit limit for users in your workspace. This limit is added on top of each seat's built-in allowance."
          action={
            <div className="relative w-32">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={defaultLimitInput}
                onChange={(e) =>
                  setDefaultLimitInput(e.target.value.replace(/[^\d]/g, ""))
                }
                onBlur={() => void handleCommitDefaultLimit()}
                disabled={isDefaultLimitInputDisabled}
                className="pr-16 text-right"
              />
              <span className="copy-sm pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground-night">
                credits
              </span>
            </div>
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
