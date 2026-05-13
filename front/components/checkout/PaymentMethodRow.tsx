import { Button } from "@dust-tt/sparkle";
import {
  AmericanExpressFlatIcon,
  DinersClubFlatIcon,
  DiscoverFlatIcon,
  GenericFlatIcon,
  JCBFlatIcon,
  MaestroFlatIcon,
  MastercardFlatIcon,
  type SVGComponentProps,
  UnionPayFlatIcon,
  VisaFlatIcon,
} from "react-svg-credit-card-payment-icons";

function CardBrandIcon({
  brand,
  ...props
}: { brand: string } & SVGComponentProps) {
  switch (brand.toLowerCase()) {
    case "visa":
      return <VisaFlatIcon {...props} />;
    case "mastercard":
      return <MastercardFlatIcon {...props} />;
    case "amex":
    case "american_express":
      return <AmericanExpressFlatIcon {...props} />;
    case "discover":
      return <DiscoverFlatIcon {...props} />;
    case "jcb":
      return <JCBFlatIcon {...props} />;
    case "unionpay":
      return <UnionPayFlatIcon {...props} />;
    case "diners":
    case "diners_club":
      return <DinersClubFlatIcon {...props} />;
    case "maestro":
      return <MaestroFlatIcon {...props} />;
    default:
      return <GenericFlatIcon {...props} />;
  }
}

function formatBrandName(brand: string): string {
  switch (brand.toLowerCase()) {
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "amex":
      return "Amex";
    case "american_express":
      return "American Express";
    case "discover":
      return "Discover";
    case "jcb":
      return "JCB";
    case "unionpay":
      return "UnionPay";
    case "diners":
    case "diners_club":
      return "Diners Club";
    case "maestro":
      return "Maestro";
    default:
      return brand.charAt(0).toUpperCase() + brand.slice(1);
  }
}

type PaymentMethodInfo =
  | { type: "card"; brand: string; last4: string }
  | { type: "sepa_debit"; last4: string };

interface PaymentMethodRowProps {
  paymentMethod: PaymentMethodInfo;
  onRestart: () => void;
}

export function PaymentMethodRow({
  paymentMethod,
  onRestart,
}: PaymentMethodRowProps) {
  return (
    <div className="flex w-full items-center justify-between rounded-lg border border-separator bg-muted px-4 py-3">
      <div className="flex items-center gap-3">
        {paymentMethod.type === "card" ? (
          <CardBrandIcon brand={paymentMethod.brand} width={38} height={24} />
        ) : (
          <GenericFlatIcon width={38} height={24} />
        )}
        <span className="text-sm font-medium">
          {paymentMethod.type === "card"
            ? `${formatBrandName(paymentMethod.brand)} •••• ${paymentMethod.last4}`
            : `IBAN •••• ${paymentMethod.last4}`}
        </span>
      </div>
      <Button label="Change" variant="ghost" size="sm" onClick={onRestart} />
    </div>
  );
}
