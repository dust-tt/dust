import {
  useDefaultUserSpendLimit,
  useUpdateDefaultUserSpendLimit,
} from "@app/lib/swr/usage_settings";
import {
  MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
} from "@app/types/credits";
import {
  ActionCreditCoinsIcon,
  Icon,
  Input,
  Page,
  SettingsList,
} from "@dust-tt/sparkle";
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
          title="Default usage limit"
          description="Define the default usage limit for all the users in your workspace"
          action={
            <div className="relative w-32">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground-night">
                <Icon visual={ActionCreditCoinsIcon} size="xs" />
              </div>
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
                className="pl-8 text-right"
              />
            </div>
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
