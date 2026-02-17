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
          Thank you{firstName ? `, ${firstName}` : ""}!
        </h2>
      </div>

      <p className="text-lg text-muted-foreground">
        We've received your partnership application. Our team will review your
        information and reach out to you soon.
      </p>

      <p className="text-muted-foreground">
        In the meantime, feel free to explore our{" "}
        <a
          href="https://docs.dust.tt"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          documentation
        </a>{" "}
        to learn more about Dust.
      </p>
    </div>
  );
}
