export type CreditUsageTarget = "on_target" | "elevated" | "critical";

export interface CreditUsageStatus {
  usedPercentage: number;
  resetAt: string;
  target: CreditUsageTarget;
}
