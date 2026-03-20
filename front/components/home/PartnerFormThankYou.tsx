import type { PartnerFormData } from "@app/lib/api/hubspot/partnerFormSchema";
import { CheckCircleIcon } from "@dust-tt/sparkle";
import { useFormContext } from "react-hook-form";

export function PartnerFormThankYou() {
  const { getValues } = useFormContext<PartnerFormData>();
  const formValues = getValues();

  const firstName = formValues.firstname ?? "";

  return (
    <div className="flex flex-col gap-6 py-8">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100">
          <CheckCircleIcon className="h-6 w-6 text-green-600" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground">
          Thank you{firstName ? `, ${firstName}` : ""} for trusting Dust!
        </h2>
      </div>

      <p className="text-lg text-muted-foreground">
        At the moment, we are gradually onboarding new partners to ensure high-quality support and co-selling. We&apos;ll let you know as soon as you&apos;re next.
      </p>

      <p className="text-muted-foreground">
        For any urgent inquiries, please contact{" "}
        <a
          href="mailto:partnerships@dust.tt"
          className="underline hover:text-foreground"
        >
          partnerships@dust.tt
        </a>
        .
      </p>
    </div>
  );
}
