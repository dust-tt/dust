export type CreditUsagePace = "on_pace" | "elevated" | "critical";

export interface CreditUsageStatus {
  usedPercentage: number;
  resetAt: string;
  pace: CreditUsagePace;
}
