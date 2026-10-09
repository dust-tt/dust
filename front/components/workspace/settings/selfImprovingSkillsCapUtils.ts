import { normalizeDecimalSeparator } from "@app/lib/i18n/format";
import type { ReinforcementBillingUnit } from "@app/lib/reinforcement/enforcement";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { useLingui } from "@lingui/react/macro";

export function useCapUnitLabel(unit: ReinforcementBillingUnit): string {
  const { t } = useLingui();

  switch (unit) {
    case "awu_credits":
      return t`credits`;
    case "micro_usd":
      return "$";
    default:
      assertNeverAndIgnore(unit);
      return "";
  }
}

// Credits are integers; dollars allow decimals.
export function normalizeCapInput(
  value: string,
  unit: ReinforcementBillingUnit
): string {
  switch (unit) {
    case "awu_credits":
      return value.replace(/[^\d]/g, "");
    case "micro_usd":
      return normalizeDecimalSeparator(value).replace(/[^\d.]/g, "");
    default:
      assertNeverAndIgnore(unit);
      return value.replace(/[^\d.]/g, "");
  }
}
