import type { CreditDisplayData, CreditType } from "@app/types/credits";

export type PokeCreditType = {
  id: number;
  createdAt: string;
  type: CreditType;
  initialAmountMicroUsd: number;
  consumedAmountMicroUsd: number;
  remainingAmountMicroUsd: number;
  startDate: string | null;
  expirationDate: string | null;
  discount: number | null;
  invoiceOrLineItemId: string | null;
  metronomeCreditId: string | null;
};

export type PokeUnifiedCreditRow = {
  rowKey: string;
  internal: PokeCreditType | null;
  metronome: CreditDisplayData | null;
};

export type PokeListCreditsResponseBody = {
  rows: PokeUnifiedCreditRow[];
  excessCreditsLast30DaysMicroUsd: number;
  hasMetronome: boolean;
};
