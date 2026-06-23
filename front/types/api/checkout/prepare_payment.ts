import type { SupportedCurrency } from "@app/types/currency";

export type GetPreparePaymentResponseBody =
  | { status: "pending" }
  | {
      status: "success";
      subtotalCents: number;
      taxCents: number;
      totalCents: number;
      seatCount: number;
      pricePerSeatCents: number;
      planCode: string;
      metronomePackageAlias: string;
      currency: SupportedCurrency;
      cardBrand?: string;
      cardLast4?: string;
      sepaLast4?: string;
    };
