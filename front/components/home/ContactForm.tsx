import {
  Button,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

// Default.com form ID (used in form data-attribute for tracking)
const DEFAULT_FORM_ID = 503792;

import type {
  ContactFormData,
  ContactSubmitResponse,
  TrackingParams,
} from "@app/components/home/contactFormSchema";
import {
  COMPANY_HEADCOUNT_OPTIONS,
  ContactFormSchema,
  HEADQUARTERS_REGION_OPTIONS,
  LANGUAGE_OPTIONS,
} from "@app/components/home/contactFormSchema";
import { ContactFormThankYou } from "@app/components/home/ContactFormThankYou";
import { clientFetch } from "@app/lib/egress/client";
import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";
import { getStoredUTMParams } from "@app/lib/utils/utm";

interface ContactFormProps {
  prefillEmail?: string;
  prefillCompany?: string;
  prefillHeadcount?: string;
  prefillRegion?: string;
}

export function ContactForm({
  prefillEmail,
  prefillHeadcount,
  prefillRegion,
}: ContactFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] =
    useState<ContactSubmitResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ContactFormData>({
    resolver: zodResolver(ContactFormSchema),
    defaultValues: {
      firstname: "",
      lastname: "",
      email: prefillEmail ?? "",
      phone: "",
      language: "",
      headquarters_region: prefillRegion ?? "",
      company_headcount_form: prefillHeadcount ?? "",
      how_to_use_dust: "",
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);

    // Get tracking params from sessionStorage
    const storedParams = getStoredUTMParams();
    const tracking: TrackingParams = {
      utm_source: storedParams.utm_source,
      utm_medium: storedParams.utm_medium,
      utm_campaign: storedParams.utm_campaign,
      utm_content: storedParams.utm_content,
      utm_term: storedParams.utm_term,
      gclid: storedParams.gclid ?? sessionStorage.getItem("gclid") ?? undefined,
      fbclid: storedParams.fbclid,
      msclkid: storedParams.msclkid,
      li_fat_id:
        storedParams.li_fat_id ??
        sessionStorage.getItem("li_fat_id") ??
        undefined,
    };

    // Debug logging for tracking params
    console.log("[ContactForm] Tracking params:", {
      storedParams,
      sessionGclid: sessionStorage.getItem("gclid"),
      sessionUtmData: sessionStorage.getItem("utm_data"),
      finalTracking: tracking,
    });

    // Track form submission attempt
    trackEvent({
      area: TRACKING_AREAS.CONTACT,
      object: "contact_form",
      action: "submit_attempt",
    });

    // Push initial GTM event (before we know qualification status)
    if (typeof window !== "undefined") {
      window.dataLayer = window.dataLayer ?? [];
      window.dataLayer.push({
        event: "contact_form_submitted",
        is_qualified: false,
      });
    }

    try {
      const response = await clientFetch("/api/contact/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          formData: data,
          tracking,
          pageUri: window.location.href,
          pageName: document.title,
        }),
      });

      const result: ContactSubmitResponse = await response.json();

      if (!response.ok || !result.success) {
        setSubmitError(
          result.error ?? "Failed to submit form. Please try again."
        );
        setIsSubmitting(false);
        return;
      }

      // Track successful submission
      trackEvent({
        area: TRACKING_AREAS.CONTACT,
        object: "contact_form",
        action: "submit_success",
      });

      // Scroll to top so the thank you message is visible
      window.scrollTo({ top: 0, behavior: "smooth" });

      // Store form data for Default.com (will be used in ContactFormThankYou)
      window.__default__ = window.__default__ ?? {};
      window.__default__.email = data.email;
      window.__default__.first_name = data.firstname;
      window.__default__.last_name = data.lastname;

      setSubmitResult(result);
    } catch {
      setSubmitError("An error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  const selectedLanguage = LANGUAGE_OPTIONS.find(
    (opt) => opt.value === form.watch("language")
  );
  const selectedRegion = HEADQUARTERS_REGION_OPTIONS.find(
    (opt) => opt.value === form.watch("headquarters_region")
  );
  const selectedHeadcount = COMPANY_HEADCOUNT_OPTIONS.find(
    (opt) => opt.value === form.watch("company_headcount_form")
  );

  // Show thank you page after successful submission
  if (submitResult) {
    return (
      <ContactFormThankYou
        firstName={form.getValues("firstname") ?? ""}
        lastName={form.getValues("lastname") ?? ""}
        email={form.getValues("email")}
        phone={form.getValues("phone") ?? ""}
        language={form.getValues("language")}
        headquartersRegion={form.getValues("headquarters_region") ?? ""}
        companyHeadcount={form.getValues("company_headcount_form")}
        howToUseDust={form.getValues("how_to_use_dust") ?? ""}
        isQualified={submitResult.isQualified}
      />
    );
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      data-default-form-id={DEFAULT_FORM_ID}
    >
      {/* First Name / Last Name */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="firstname"
          render={({ field }) => (
            <Input {...field} label="First Name" placeholder="" />
          )}
        />
        <Controller
          control={form.control}
          name="lastname"
          render={({ field }) => (
            <Input {...field} label="Last Name" placeholder="" />
          )}
        />
      </div>

      {/* Work Email */}
      <Controller
        control={form.control}
        name="email"
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-2">
            <Label>
              Work Email<span className="text-red-500">*</span>
            </Label>
            <Input
              {...field}
              placeholder=""
              type="email"
              isError={fieldState.error !== undefined}
              message={fieldState.error?.message}
              messageStatus="error"
            />
          </div>
        )}
      />

      {/* Phone Number */}
      <Controller
        control={form.control}
        name="phone"
        render={({ field }) => (
          <Input
            {...field}
            label="Phone Number"
            placeholder="+1 (555) 000-0000"
            type="tel"
          />
        )}
      />

      {/* Language */}
      <Controller
        control={form.control}
        name="language"
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-2">
            <Label>
              Language you'd like to use<span className="text-red-500">*</span>
            </Label>
            <div className="w-fit">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    label={selectedLanguage?.label ?? "Select language"}
                    variant="outline"
                    size="md"
                    icon={ChevronDownIcon}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => field.onChange(option.value)}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {fieldState.error && (
              <p className="text-sm text-red-500">{fieldState.error.message}</p>
            )}
          </div>
        )}
      />

      {/* Headquarters Region */}
      <Controller
        control={form.control}
        name="headquarters_region"
        render={({ field }) => (
          <div className="flex flex-col gap-2">
            <Label>Headquarters Region</Label>
            <div className="w-fit">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    label={selectedRegion?.label ?? "Select region"}
                    variant="outline"
                    size="md"
                    icon={ChevronDownIcon}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {HEADQUARTERS_REGION_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => field.onChange(option.value)}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      />

      {/* Company Headcount */}
      <Controller
        control={form.control}
        name="company_headcount_form"
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-2">
            <Label>
              Company Headcount<span className="text-red-500">*</span>
            </Label>
            <div className="w-fit">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    label={selectedHeadcount?.label ?? "Select headcount"}
                    variant="outline"
                    size="md"
                    icon={ChevronDownIcon}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {COMPANY_HEADCOUNT_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => field.onChange(option.value)}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {fieldState.error && (
              <p className="text-sm text-red-500">{fieldState.error.message}</p>
            )}
          </div>
        )}
      />

      {/* How do you want to use Dust? */}
      <Controller
        control={form.control}
        name="how_to_use_dust"
        render={({ field }) => (
          <div className="flex flex-col gap-2">
            <Label>How do you want to use Dust?</Label>
            <TextArea {...field} rows={4} placeholder="" />
          </div>
        )}
      />

      {/* Disclaimer */}
      <div className="text-xs text-muted-foreground">
        <p className="mb-2">
          Dust uses your contact information to communicate with you about our
          products and services. You may unsubscribe at any time. Please review
          our{" "}
          <a
            href="https://dust.tt/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Privacy Policy
          </a>{" "}
          to learn about our privacy practices, data protection measures, and
          unsubscribe procedures.
        </p>
        <p>
          Dust serves certain geographic regions and customer segments
          exclusively through our certified partner network. When you submit an
          inquiry from these regions, your contact information will be directed
          to the appropriate authorized partner who will handle your evaluation,
          purchase, and implementation.
        </p>
      </div>

      {submitError && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <Button
        type="submit"
        label={isSubmitting ? "Submitting..." : "Submit"}
        variant="primary"
        size="md"
        disabled={isSubmitting}
        icon={isSubmitting ? Spinner : undefined}
      />
    </form>
  );
}
