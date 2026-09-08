import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import {
  InputField,
  SelectField,
} from "@app/components/poke/shadcn/ui/form/fields";
import { clientFetch } from "@app/lib/egress/client";
import { amountCents } from "@app/lib/metronome/amounts";
import {
  commitmentAmount,
  commitmentMonths,
  commitmentPeriodEnd,
  maxInvoicePeriods,
} from "@app/lib/metronome/seat_commitment";
import { isPaygEligibleTier } from "@app/lib/metronome/types";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  CREDIT_PRICED_ENTERPRISE_DEFAULT_PLAN_CODE,
  isBusinessPlanPrefix,
  isEnterprisePlanPrefix,
} from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import type {
  ContractDurationUnit,
  SwitchContractTemplate,
} from "@app/lib/poke/switch_contract_templates";
import { SWITCH_CONTRACT_TEMPLATES } from "@app/lib/poke/switch_contract_templates";
import {
  usePokeMetronomePackages,
  usePokePlans,
  usePokeStripeCustomerCurrency,
} from "@app/lib/swr/poke";
import { usePokePluginAsyncArgs } from "@app/poke/swr/plugins";
import type { SupportedCurrency } from "@app/types/currency";
import { SUPPORTED_CURRENCIES } from "@app/types/currency";
import { BILLABLE_SEAT_TYPES } from "@app/types/memberships";
import { isCreditPricedPlan } from "@app/types/plan";
import { CreditUsageConfigurationSchema } from "@app/types/poke/credit_usage_configuration";
import { SwitchContractBodySchema } from "@app/types/poke/switch_contract";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Built on top of `SwitchContractBodySchema` so the many identical scalar
// fields (planCode, startingAt, endingAt, netPaymentTermsDays, paygEnabled,
// usageCapCredits, the credit-config fields, hubspotDealId, purchaseOrderId,
// stripeCustomerId, promoteNoneSeatsTo, initialCredits, scheduledCharge,
// recurringFreeCredit, seats, ...) are inherited verbatim instead of
// duplicated. Each optional section's on/off toggle is just presence vs.
// `undefined` on its inherited field — no separate toggle state needed.
// `legacyMigrationFreeAwuCreditsPerUser` is omitted since it isn't used by
// this dialog.
const SwitchContractFormSchema = SwitchContractBodySchema.omit({
  legacyMigrationFreeAwuCreditsPerUser: true,
}).extend({
  // How the enterprise contract's start moment is resolved:
  //  - "immediately": swap at the current hour (no startingAt sent).
  //  - "retroactive_first_of_month": backdate to the 1st of the current month,
  //    00:00 UTC.
  //  - "select": use the operator-chosen `startingAt` (the only mode that
  //    surfaces the date picker).
  startMode: z
    .enum(["immediately", "retroactive_first_of_month", "select"])
    .default("select"),
  // Billing currency picked directly by the operator when no Stripe customer
  // is wired in (there's no Stripe currency to resolve). Not sent to the
  // server — only the currency-matching package selection matters there.
  manualCurrency: z.enum(SUPPORTED_CURRENCIES).default("usd"),
});
type SwitchContractFormValues = z.infer<typeof SwitchContractFormSchema>;

type SwitchContractBodyInput = z.input<typeof SwitchContractBodySchema>;

function snapDatetimeLocalToHour(value: string): string {
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) &&
    value.slice(14, 16) !== "00"
  ) {
    return value.slice(0, 14) + "00";
  }
  return value;
}

// Add a contract duration to a start moment (UTC), clamping month/year day
// overflow to the last day of the target month (Jan 31 + 1 month → Feb 28/29).
function addContractDuration(
  start: Date,
  value: number,
  unit: ContractDurationUnit
): Date {
  if (unit === "weeks") {
    return new Date(start.getTime() + value * 7 * 24 * 60 * 60 * 1000);
  }
  const monthsToAdd = unit === "years" ? value * 12 : value;
  const targetMonthIndex = start.getUTCMonth() + monthsToAdd;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(start.getUTCDate(), lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      0,
      0
    )
  );
}

// Floor a moment to the start of its UTC hour. Contracts always start and end
// on whole hours, so the duration math anchors to the floored start hour.
function floorToHourUTC(d: Date): Date {
  const floored = new Date(d);
  floored.setUTCMinutes(0, 0, 0);
  return floored;
}

// Format a Date to the `YYYY-MM-DDTHH:mm` shape the datetime-local field uses,
// interpreted in UTC.
function toDatetimeLocalUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

type SeatFormValue = {
  selected: boolean;
  minSeats: number;
  maxSeats?: number;
  rate: number;
  commitmentPrice?: number;
  paymentSchedule: {
    frequency:
      | "one_time"
      | "monthly"
      | "quarterly"
      | "semi_annually"
      | "annually";
    periods?: number;
  };
};

// Default seat settings for a package: entitled seats pre-selected, the rest
// unchecked for the operator to opt into; minSeats 0 and the rate converted from
// Metronome's fiat unit to the dialog's major units. Shared by the seat-reset
// effect and template application so they can't drift.
function buildDefaultSeats(
  seats: { seatType: string; defaultRate: number | null; entitled: boolean }[],
  resolvedCurrency: SupportedCurrency | null | undefined
): Record<string, SeatFormValue> {
  const next: Record<string, SeatFormValue> = {};
  for (const seat of seats) {
    const rate =
      seat.defaultRate != null && resolvedCurrency
        ? amountCents(seat.defaultRate, resolvedCurrency) / 100
        : (seat.defaultRate ?? 0);
    next[seat.seatType] = {
      selected: seat.entitled,
      minSeats: 0,
      maxSeats: undefined,
      rate,
      paymentSchedule: { frequency: "one_time" },
    };
  }
  return next;
}

// Merge a template's per-seat overrides onto a package's default seats. Seat
// types the package does not sell have no entry to merge onto and are skipped.
function mergeTemplateSeats(
  base: Record<string, SeatFormValue>,
  templateSeats: SwitchContractTemplate["seats"]
): Record<string, SeatFormValue> {
  if (!templateSeats) {
    return base;
  }
  const next = { ...base };
  for (const [seatType, override] of Object.entries(templateSeats)) {
    if (!override || !next[seatType]) {
      continue;
    }
    next[seatType] = { ...next[seatType], ...override };
  }
  return next;
}

const isLegacyPackageName = (name: string) => /\blegacy\b/i.test(name);

const DEFAULT_PERIODS_FOR_FREQUENCY: Record<string, number | undefined> = {
  monthly: 12,
  quarterly: 4,
  semi_annually: 2,
  annually: 1,
  one_time: undefined,
};

// A small number input + unit dropdown (years / months / weeks), reused for the
// contract duration and the promotional offer period.
function PeriodField({
  value,
  unit,
  onValueChange,
  onUnitChange,
  portalContainer,
  min = 1,
}: {
  value: number;
  unit: ContractDurationUnit;
  onValueChange: (value: number) => void;
  onUnitChange: (unit: ContractDurationUnit) => void;
  portalContainer: HTMLElement | undefined;
  min?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onValueChange(Number(e.target.value))}
        className="h-7 w-14 rounded-md border border-border bg-background px-1.5 text-xs"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            isSelect
            label={
              unit === "years"
                ? "Years"
                : unit === "months"
                  ? "Months"
                  : "Weeks"
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent mountPortalContainer={portalContainer}>
          <DropdownMenuItem
            label="Years"
            onClick={() => onUnitChange("years")}
          />
          <DropdownMenuItem
            label="Months"
            onClick={() => onUnitChange("months")}
          />
          <DropdownMenuItem
            label="Weeks"
            onClick={() => onUnitChange("weeks")}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface SwitchContractDialogProps {
  owner: WorkspaceType;
  stripeCustomerId: string | null;
}

export default function SwitchContractDialog({
  owner,
  stripeCustomerId,
}: SwitchContractDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [durationMode, setDurationMode] = useState(false);
  const [durationValue, setDurationValue] = useState(1);
  const [durationUnit, setDurationUnit] =
    useState<ContractDurationUnit>("years");
  // Promotional free period offered at the start of the contract (0 = none),
  // applied globally to every seat commitment's earliest bills.
  const [offerValue, setOfferValue] = useState(0);
  const [offerUnit, setOfferUnit] = useState<ContractDurationUnit>("weeks");
  const [appliedTemplateName, setAppliedTemplateName] = useState<string | null>(
    null
  );
  // Template whose non-package fields still need applying once the package it
  // selects has repopulated the seats (see the apply-template effect below).
  const pendingTemplateRef = useRef<SwitchContractTemplate | null>(null);
  const [portalContainer, setPortalContainer] = useState<
    HTMLElement | undefined
  >(undefined);

  useEffect(() => {
    if (typeof document !== "undefined") {
      setPortalContainer(document.body);
    }
  }, []);

  const { plans } = usePokePlans();
  const {
    packages: metronomePackages,
    isPackagesLoading,
    packagesError,
  } = usePokeMetronomePackages({ disabled: !open });
  const router = useAppRouter();

  // Default datetime seeded into the enterprise startingAt field: midnight UTC
  // of the day after today. The operator may freely change it to any moment,
  // including the past — there is no enforced minimum.
  const defaultStartingAtUTC = useMemo(() => {
    const now = new Date();
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    );
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
      `T00:00`
    );
  }, []);

  // No prefilled usage cap: the legacy `programmatic_usage_configuration.paygCapMicroUsd`
  // is for the programmatic-usage / Stripe flow and must not be read here.
  // The credit-priced usage cap lives on `credit_usage_configuration.usageCapCredits`
  // and is managed via the "Manage Credit Usage Configuration" plugin — operators
  // enter the desired cap (in AWU credits) fresh when switching contracts.
  const formDefaults: SwitchContractFormValues = useMemo(
    () => ({
      metronomePackageId: "",
      planCode: "",
      hubspotDealId: "",
      purchaseOrderId: "",
      startingAt: "",
      startMode: "select",
      manualCurrency: "usd",
      endingAt: "",
      stripeCustomerId: stripeCustomerId ?? "",
      stripeCollectionMethod: "charge_automatically",
      netPaymentTermsDays: undefined,
      paygEnabled: false,
      usageCapCredits: undefined,
      defaultDiscountPercent: 0,
      balanceThresholdCredits: undefined,
      defaultPoolCapCredits: undefined,
      programmaticMonthlyCapCredits: undefined,
      autoSeatUpgradeEnabled: false,
      topUpEnabled: false,
      autoInvoiceFinalizationEnabled: true,
      promoteNoneSeatsTo: undefined,
      initialCredits: undefined,
      scheduledCharge: undefined,
      recurringFreeCredit: undefined,
      seats: {},
    }),
    [stripeCustomerId]
  );
  const form = useForm<SwitchContractFormValues>({
    resolver: zodResolver(SwitchContractFormSchema),
    defaultValues: formDefaults,
  });

  const watchedStripeCustomerId = form.watch("stripeCustomerId");
  const trimmedStripeCustomerId = watchedStripeCustomerId.trim() || null;
  const hasStripeCustomer = trimmedStripeCustomerId !== null;
  const {
    currency: stripeCurrency,
    isCurrencyLoading,
    currencyError,
  } = usePokeStripeCustomerCurrency({
    stripeCustomerId: trimmedStripeCustomerId,
    disabled: !open,
  });
  // No Stripe customer means no Stripe billing config on the contract, so
  // there's no Stripe currency to match against — the operator picks any
  // package currency directly instead (see `manualCurrency`).
  const manualCurrency = form.watch("manualCurrency");
  const resolvedCurrency = hasStripeCustomer ? stripeCurrency : manualCurrency;

  // Fetch the existing credit config so we pre-populate form fields with
  // current values rather than schema defaults, avoiding accidental overwrites.
  const { asyncArgs: existingCreditConfig } = usePokePluginAsyncArgs({
    pluginId: "manage-credit-usage-configuration",
    pluginResourceTarget: {
      resourceType: "workspaces",
      resourceId: owner.sId,
      workspace: owner,
    },
    disabled: !open,
  });
  const creditConfigAppliedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      // Re-arm the one-shot prefill for the next open; the operator-facing
      // resets happen in the dialog's onOpenChange handler.
      creditConfigAppliedRef.current = false;
      return;
    }
    if (!existingCreditConfig || creditConfigAppliedRef.current) {
      return;
    }
    creditConfigAppliedRef.current = true;
    const parsed =
      CreditUsageConfigurationSchema.safeParse(existingCreditConfig);
    if (!parsed.success) {
      return;
    }
    const d = parsed.data;
    // The plugin uses 0 for "no cap/limit"; the form uses undefined.
    const orUndefined = (n: number) => (n > 0 ? n : undefined);
    form.setValue("defaultDiscountPercent", d.defaultDiscountPercent);
    form.setValue("paygEnabled", d.paygEnabled);
    form.setValue("usageCapCredits", orUndefined(d.usageCapCredits));
    form.setValue(
      "balanceThresholdCredits",
      orUndefined(d.balanceThresholdCredits)
    );
    form.setValue(
      "defaultPoolCapCredits",
      orUndefined(d.defaultPoolCapCredits)
    );
    form.setValue(
      "programmaticMonthlyCapCredits",
      orUndefined(d.programmaticMonthlyCapCredits)
    );
    form.setValue("autoSeatUpgradeEnabled", d.autoSeatUpgradeEnabled);
    form.setValue("topUpEnabled", d.topUpEnabled);
    form.setValue(
      "autoInvoiceFinalizationEnabled",
      d.autoInvoiceFinalizationEnabled
    );
  }, [open, existingCreditConfig, form]);

  // Split packages into Current vs Legacy sections (name contains "legacy",
  // case-insensitive). Each section preserves the lib-side sort order.
  const packageGroups = useMemo(() => {
    const visible = metronomePackages.filter(
      (p) => p.currency === resolvedCurrency
    );
    const toOption = (p: (typeof visible)[number]) => ({
      value: p.id,
      display: `${p.name} (${p.tier}, ${p.currency.toUpperCase()})`,
    });
    return [
      {
        label: "Current",
        options: visible
          .filter((p) => !isLegacyPackageName(p.name))
          .map(toOption),
      },
      // We hide the legacy ones as there is no use case switching to them (at least for now).
      // {
      //   label: "Legacy",
      //   options: inCurrency.filter((p) => isLegacy(p.name)).map(toOption),
      // },
    ];
  }, [metronomePackages, resolvedCurrency]);

  const selectedPackageId = form.watch("metronomePackageId");
  const selectedPackage = useMemo(
    () => metronomePackages.find((p) => p.id === selectedPackageId),
    [metronomePackages, selectedPackageId]
  );
  const selectedTier = selectedPackage?.tier ?? null;
  const selectedSeats = useMemo(
    () => selectedPackage?.seats ?? [],
    [selectedPackage]
  );

  // Reset the seat settings to the seats of the newly selected package: seats
  // the package entitles are pre-selected, the rest are shown unchecked for the
  // operator to opt into. Min seats defaults to 0, the rate is prefilled from
  // the package override default. The default is in Metronome's fiat unit (cents
  // for USD, whole units for EUR); the dialog works in major units
  // (dollars/euros), so convert for display. Avoids stale values leaking across
  // package selections.
  useEffect(() => {
    form.setValue("seats", buildDefaultSeats(selectedSeats, resolvedCurrency));
  }, [selectedSeats, form, resolvedCurrency]);

  // Clear a stale package selection when the resolved currency changes so a
  // previously-picked package can't survive a currency switch silently.
  useEffect(() => {
    if (
      resolvedCurrency &&
      selectedPackage &&
      selectedPackage.currency !== resolvedCurrency
    ) {
      form.setValue("metronomePackageId", "");
    }
  }, [resolvedCurrency, selectedPackage, form]);

  // When the operator picks a package, default the plan code for the tier. The
  // full list of CP_BUSINESS_* / CP_ENT_* plans is offered for the matching
  // tier (see business/enterprise plan options), each defaulting to its tier's
  // canonical plan code. Both tiers use the same operator-chosen start moment.
  useEffect(() => {
    if (selectedTier === "business") {
      form.setValue("planCode", CREDIT_PRICED_BUSINESS_PLAN_CODE);
      // Pay-as-you-go and top-up are not offered for business in this dialog.
      form.setValue("paygEnabled", false);
      form.setValue("topUpEnabled", false);
    } else if (selectedTier === "enterprise") {
      form.setValue("planCode", CREDIT_PRICED_ENTERPRISE_DEFAULT_PLAN_CODE);
    }
    if (selectedTier) {
      form.setValue("startingAt", defaultStartingAtUTC);
      form.setValue("startMode", "select");
      form.setValue("endingAt", "");
    }
    if (selectedTier && !isPaygEligibleTier(selectedTier)) {
      form.setValue("paygEnabled", false);
      form.setValue("usageCapCredits", undefined);
    }
  }, [selectedTier, form, defaultStartingAtUTC]);

  // Resolve a template's contract type to a concrete package id in the resolved
  // currency: same tier and, when given, a case-insensitive name-substring match.
  const resolveTemplatePackageId = useCallback(
    (template: SwitchContractTemplate): string | null => {
      if (!template.package) {
        return null;
      }
      const pattern = template.package.namePattern?.toLowerCase();
      const match = metronomePackages.find(
        (p) =>
          p.tier === template.package?.tier &&
          p.currency === resolvedCurrency &&
          (!pattern || p.name.toLowerCase().includes(pattern))
      );
      return match?.id ?? null;
    },
    [metronomePackages, resolvedCurrency]
  );

  // Apply every non-package field of a template onto the form. Package selection
  // is handled separately (it repopulates the seats first), so this runs either
  // directly (package unchanged / template has none) or from the apply-template
  // effect once the seats are ready.
  const applyTemplateFields = useCallback(
    (template: SwitchContractTemplate) => {
      if (template.planCode !== undefined) {
        form.setValue("planCode", template.planCode);
      }
      if (template.startMode !== undefined) {
        form.setValue("startMode", template.startMode);
      }
      if (template.startingAt !== undefined) {
        form.setValue("startingAt", template.startingAt);
      }
      if (template.netPaymentTermsDays !== undefined) {
        form.setValue("netPaymentTermsDays", template.netPaymentTermsDays);
      }
      if (template.defaultDiscountPercent !== undefined) {
        form.setValue(
          "defaultDiscountPercent",
          template.defaultDiscountPercent
        );
      }
      if (template.usageCapCredits !== undefined) {
        form.setValue("usageCapCredits", template.usageCapCredits);
      }
      if (template.defaultPoolCapCredits !== undefined) {
        form.setValue("defaultPoolCapCredits", template.defaultPoolCapCredits);
      }
      if (template.paygEnabled !== undefined) {
        form.setValue("paygEnabled", template.paygEnabled);
      }
      if (template.autoSeatUpgradeEnabled !== undefined) {
        form.setValue(
          "autoSeatUpgradeEnabled",
          template.autoSeatUpgradeEnabled
        );
      }
      if (template.topUpEnabled !== undefined) {
        form.setValue("topUpEnabled", template.topUpEnabled);
      }
      if (template.autoInvoiceFinalizationEnabled !== undefined) {
        form.setValue(
          "autoInvoiceFinalizationEnabled",
          template.autoInvoiceFinalizationEnabled
        );
      }
      if (template.promoteNoneSeatsTo !== undefined) {
        form.setValue("promoteNoneSeatsTo", template.promoteNoneSeatsTo);
      }
      if (template.initialCredits !== undefined) {
        form.setValue("initialCredits", template.initialCredits);
      }
      if (template.scheduledCharge !== undefined) {
        form.setValue("scheduledCharge", template.scheduledCharge);
      }
      if (template.recurringFreeCredit !== undefined) {
        form.setValue("recurringFreeCredit", template.recurringFreeCredit);
      }
      // Merge seat overrides onto the current package's seats.
      if (template.seats) {
        form.setValue(
          "seats",
          mergeTemplateSeats(form.getValues("seats") ?? {}, template.seats)
        );
      }
    },
    [form]
  );

  const applyTemplate = useCallback(
    (template: SwitchContractTemplate) => {
      setError(null);
      setAppliedTemplateName(template.name);
      pendingTemplateRef.current = null;

      const packageId = resolveTemplatePackageId(template);
      // Surface a resolution miss instead of silently applying no package (and
      // therefore no seats): the package name/currency may not match this env.
      if (template.package && !packageId) {
        setError(
          `Template "${template.name}": no ${template.package.tier} package` +
            (template.package.namePattern
              ? ` matching "${template.package.namePattern}"`
              : "") +
            ` found for ${resolvedCurrency?.toUpperCase() ?? "the selected currency"}. ` +
            "Pick a package manually."
        );
      }
      const isSamePackage =
        Boolean(packageId) && packageId === selectedPackageId;

      // Start from a blank form so no field from a previously applied template
      // lingers. The billing identity (Stripe customer + currency) is preserved
      // since it identifies the customer, not the contract shape. When the
      // package is unchanged the seat-reset effect won't fire, so seed the
      // package's default seats (with the template's overrides) into this single
      // reset — a reset() followed by a setValue() on the nested `seats` object
      // races and leaves the seat fields blank.
      const current = form.getValues();
      form.reset({
        ...formDefaults,
        stripeCustomerId: current.stripeCustomerId,
        stripeCollectionMethod: current.stripeCollectionMethod,
        manualCurrency: current.manualCurrency,
        ...(isSamePackage
          ? {
              metronomePackageId: packageId,
              startingAt: defaultStartingAtUTC,
              seats: mergeTemplateSeats(
                buildDefaultSeats(selectedSeats, resolvedCurrency),
                template.seats
              ),
            }
          : {}),
      });
      // Duration and offer are local UI state that don't depend on the package,
      // so set them here in the handler (not from the deferred effect below).
      setDurationMode(template.duration !== undefined);
      setDurationValue(template.duration?.value ?? 1);
      setDurationUnit(template.duration?.unit ?? "years");
      setOfferValue(template.offerFreePeriod?.value ?? 0);
      setOfferUnit(template.offerFreePeriod?.unit ?? "weeks");

      if (packageId && !isSamePackage) {
        // The package changes: selecting it repopulates the seats and resets the
        // tier defaults, so defer the rest of the template until that settles.
        pendingTemplateRef.current = template;
        form.setValue("metronomePackageId", packageId);
      } else {
        // Same package (seats already seeded above) or no package: apply the
        // remaining scalar fields now.
        applyTemplateFields(template);
      }
    },
    [
      resolveTemplatePackageId,
      selectedPackageId,
      selectedSeats,
      resolvedCurrency,
      defaultStartingAtUTC,
      form,
      formDefaults,
      applyTemplateFields,
    ]
  );

  // Second phase of applying a template: once selecting its package has
  // repopulated the seats and reset the tier defaults, apply the template's own
  // fields on top. Placed after the seat-reset and tier-default effects so it
  // wins. No-op unless a template is pending.
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedSeats and selectedTier are intentional re-run triggers — this effect must fire once the package's seats/tier have settled, even though it reads neither directly.
  useEffect(() => {
    const pending = pendingTemplateRef.current;
    if (!pending) {
      return;
    }
    pendingTemplateRef.current = null;
    applyTemplateFields(pending);
  }, [selectedSeats, selectedTier, applyTemplateFields]);

  const startMode = form.watch("startMode");
  const startingAt = form.watch("startingAt");
  const startingAtLocalLabel = useMemo(() => {
    if (!startingAt) {
      return null;
    }
    const d = new Date(startingAt + ":00Z");
    if (isNaN(d.getTime())) {
      return null;
    }
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }, [startingAt]);

  const endingAt = form.watch("endingAt");
  const endingAtLocalLabel = useMemo(() => {
    if (!endingAt) {
      return null;
    }
    const d = new Date(endingAt + ":00Z");
    if (isNaN(d.getTime())) {
      return null;
    }
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }, [endingAt]);

  // 1st of the current month at 00:00 UTC — the "retroactive" anchor. Computed
  // as an ISO string sent verbatim to the server (no datetime-local conversion).
  const { retroactiveFirstOfMonthISO, retroactiveFirstOfMonthLabel } =
    useMemo(() => {
      const now = new Date();
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
      );
      return {
        retroactiveFirstOfMonthISO: d.toISOString(),
        retroactiveFirstOfMonthLabel: d.toUTCString(),
      };
    }, []);

  // Resolve the contract start moment the same way `onSubmit` does, so the
  // commitment-period info and the per-seat default commitment prices reflect
  // what will actually be provisioned.
  const commitmentStartDate = useMemo(() => {
    if (startMode === "retroactive_first_of_month") {
      return new Date(retroactiveFirstOfMonthISO);
    }
    if (startMode === "immediately") {
      // "Immediately" swaps at a whole hour; floor now so the displayed period,
      // prorated defaults, and computed end date all sit on hour boundaries.
      return floorToHourUTC(new Date());
    }
    if (startMode === "select" && startingAt) {
      const d = new Date(startingAt + ":00Z");
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }, [startMode, startingAt, retroactiveFirstOfMonthISO]);

  const commitmentEndDate = useMemo(() => {
    if (!endingAt) {
      return undefined;
    }
    const d = new Date(endingAt + ":00Z");
    return isNaN(d.getTime()) ? undefined : d;
  }, [endingAt]);

  // The commitment period drives the default seat commitment prices: it runs
  // from the contract start to its end date, or one year when open-ended.
  const commitmentPeriodInfo = useMemo(() => {
    if (!commitmentStartDate) {
      return null;
    }
    const end = commitmentPeriodEnd(commitmentStartDate, commitmentEndDate);
    return {
      start: commitmentStartDate,
      end,
      months: commitmentMonths(commitmentStartDate, end),
      openEnded: commitmentEndDate === undefined,
    };
  }, [commitmentStartDate, commitmentEndDate]);

  // While "Set duration" is on, the end date is derived from the (floored) start
  // plus the chosen duration and kept in sync as the start, value, or unit
  // change — the end-date field is read-only in this mode. Anchored to the
  // floored start hour so the end lands on a whole hour.
  useEffect(() => {
    if (!durationMode || !commitmentStartDate || !(durationValue > 0)) {
      return;
    }
    const end = addContractDuration(
      floorToHourUTC(commitmentStartDate),
      durationValue,
      durationUnit
    );
    form.setValue("endingAt", toDatetimeLocalUTC(end));
  }, [durationMode, commitmentStartDate, durationValue, durationUnit, form]);

  const startModeOptions = useMemo(
    () => [
      { value: "immediately", display: "Start immediately" },
      {
        value: "retroactive_first_of_month",
        display: `Start retroactively on ${retroactiveFirstOfMonthLabel}`,
      },
      { value: "select", display: "Select start time" },
    ],
    [retroactiveFirstOfMonthLabel]
  );

  const enterprisePlanOptions = useMemo(
    () =>
      plans
        .filter(
          (plan) =>
            isEnterprisePlanPrefix(plan.code) && isCreditPricedPlan(plan)
        )
        .map((plan) => ({
          value: plan.code,
          display: `${plan.name} (${plan.code})`,
        })),
    [plans]
  );

  const businessPlanOptions = useMemo(
    () =>
      plans
        .filter(
          (plan) => isBusinessPlanPrefix(plan.code) && isCreditPricedPlan(plan)
        )
        .map((plan) => ({
          value: plan.code,
          display: `${plan.name} (${plan.code})`,
        })),
    [plans]
  );

  const paygEnabled = form.watch("paygEnabled");
  const paygEligible =
    selectedTier !== null && isPaygEligibleTier(selectedTier);
  const autoSeatUpgradeEnabled = form.watch("autoSeatUpgradeEnabled");
  const topUpEnabled = form.watch("topUpEnabled");
  const autoInvoiceFinalizationEnabled = form.watch(
    "autoInvoiceFinalizationEnabled"
  );

  const initialCredits = form.watch("initialCredits");
  const scheduledCharge = form.watch("scheduledCharge");
  const recurringFreeCredit = form.watch("recurringFreeCredit");

  const stripeCollectionMethod = form.watch("stripeCollectionMethod");
  const watchedSeats = form.watch("seats");
  const promoteNoneSeatsTo = form.watch("promoteNoneSeatsTo");

  // "Force seat type" may only promote members onto a seat that is actually
  // entitled (checked) on the contract being created — offering an
  // unentitled seat type would silently fail server-side. Recomputed on
  // every render (not memoized against `watchedSeats`'s object identity,
  // which doesn't reliably change across nested-field updates) so this
  // stays in sync with the live checkbox state, same as each row's own
  // `isSelected`.
  const enterableSeatTypes = BILLABLE_SEAT_TYPES.filter(
    (seatType) => watchedSeats?.[seatType]?.selected ?? false
  );

  // Clear a forced seat type that's no longer entitled (e.g. the operator
  // unchecked it) so a stale override can't be submitted silently.
  useEffect(() => {
    if (
      promoteNoneSeatsTo &&
      !enterableSeatTypes.some((seatType) => seatType === promoteNoneSeatsTo)
    ) {
      form.setValue("promoteNoneSeatsTo", undefined);
    }
  }, [promoteNoneSeatsTo, enterableSeatTypes, form]);

  // Canonical default installment count for a payment frequency, capped so no
  // installment lands at or past the commitment period end (a 3rd monthly
  // invoice on a six-week contract would never be raised). Reads the start/end
  // from the live form values so it tracks whatever the operator has entered.
  const cappedDefaultPeriods = useCallback(
    (
      freq: "one_time" | "monthly" | "quarterly" | "semi_annually" | "annually",
      values: {
        startMode?: string;
        startingAt?: string;
        endingAt?: string;
      }
    ): number | undefined => {
      const base = DEFAULT_PERIODS_FOR_FREQUENCY[freq];
      if (base === undefined || freq === "one_time") {
        return base;
      }
      const start =
        values.startMode === "retroactive_first_of_month"
          ? new Date(retroactiveFirstOfMonthISO)
          : values.startMode === "immediately"
            ? new Date()
            : values.startMode === "select" && values.startingAt
              ? new Date(values.startingAt + ":00Z")
              : null;
      if (!start || isNaN(start.getTime())) {
        return base;
      }
      const end = values.endingAt
        ? new Date(values.endingAt + ":00Z")
        : undefined;
      return Math.min(
        base,
        maxInvoicePeriods(start, commitmentPeriodEnd(start, end), freq)
      );
    },
    [retroactiveFirstOfMonthISO]
  );

  // When any payment frequency field changes, pre-fill its sibling periods
  // field with the canonical default. Uses form.watch(callback) — the only
  // reliable way to know exactly which field changed (via the `name` argument).
  useEffect(() => {
    const { unsubscribe } = form.watch((value, { name }) => {
      if (name === "initialCredits.paymentSchedule.frequency") {
        const freq = value.initialCredits
          ? (value.initialCredits.paymentSchedule?.frequency ?? "one_time")
          : "one_time";
        form.setValue(
          "initialCredits.paymentSchedule.periods",
          cappedDefaultPeriods(freq, value)
        );
      }
      if (name === "scheduledCharge.paymentSchedule.frequency") {
        const freq = value.scheduledCharge
          ? (value.scheduledCharge.paymentSchedule?.frequency ?? "one_time")
          : "one_time";
        form.setValue(
          "scheduledCharge.paymentSchedule.periods",
          cappedDefaultPeriods(freq, value)
        );
      }
      if (
        name?.startsWith("seats.") &&
        name.endsWith(".paymentSchedule.frequency")
      ) {
        const seatType = name.split(".")[1];
        const freq =
          value.seats?.[seatType]?.paymentSchedule?.frequency ?? "one_time";
        form.setValue(
          `seats.${seatType}.paymentSchedule.periods`,
          cappedDefaultPeriods(freq, value)
        );
      }
      // A commitment can't be invoiced at a $0 rate — clear a stale commitment
      // price left over from before the rate was zeroed out.
      if (name?.startsWith("seats.") && name.endsWith(".rate")) {
        const seatType = name.split(".")[1];
        const rate = value.seats?.[seatType]?.rate ?? 0;
        if (rate <= 0) {
          form.setValue(`seats.${seatType}.commitmentPrice`, undefined);
        }
      }
    });
    return unsubscribe;
  }, [form, cappedDefaultPeriods]);

  const onSubmit = useCallback(
    (values: SwitchContractFormValues) => {
      const trimmedHubspotDealId = values.hubspotDealId?.trim();
      const trimmedPurchaseOrderId = values.purchaseOrderId?.trim();
      const cleaned: SwitchContractBodyInput = {
        metronomePackageId: values.metronomePackageId.trim(),
        planCode: values.planCode.trim(),
        paygEnabled: values.paygEnabled,
        stripeCustomerId: values.stripeCustomerId.trim(),
        stripeCollectionMethod: values.stripeCollectionMethod,
        ...(trimmedHubspotDealId
          ? { hubspotDealId: trimmedHubspotDealId }
          : {}),
        ...(trimmedPurchaseOrderId
          ? { purchaseOrderId: trimmedPurchaseOrderId }
          : {}),
      };
      if (values.netPaymentTermsDays !== undefined) {
        cleaned.netPaymentTermsDays = values.netPaymentTermsDays;
      }
      if (values.usageCapCredits !== undefined) {
        cleaned.usageCapCredits = values.usageCapCredits;
      }
      cleaned.defaultDiscountPercent = values.defaultDiscountPercent;
      cleaned.autoSeatUpgradeEnabled = values.autoSeatUpgradeEnabled;
      cleaned.topUpEnabled = values.topUpEnabled;
      cleaned.autoInvoiceFinalizationEnabled =
        values.autoInvoiceFinalizationEnabled;
      // Optional seat-type override: forces seat-less members onto this seat on
      // the new contract. Only sent when the operator checked the override.
      if (values.promoteNoneSeatsTo !== undefined) {
        cleaned.promoteNoneSeatsTo = values.promoteNoneSeatsTo;
      }
      if (values.balanceThresholdCredits !== undefined) {
        cleaned.balanceThresholdCredits = values.balanceThresholdCredits;
      }
      if (values.defaultPoolCapCredits !== undefined) {
        cleaned.defaultPoolCapCredits = values.defaultPoolCapCredits;
      }
      if (values.programmaticMonthlyCapCredits !== undefined) {
        cleaned.programmaticMonthlyCapCredits =
          values.programmaticMonthlyCapCredits;
      }
      // Initial credits: a contract-level prepaid commit. Only sent when the
      // operator toggled the section on.
      if (values.initialCredits !== undefined) {
        cleaned.initialCredits = values.initialCredits;
      }
      // Scheduled charge: a pure invoice line item, no credit grant. Only
      // sent when the operator toggled the section on.
      if (values.scheduledCharge !== undefined) {
        const { invoiceAmount, paymentSchedule, name } = values.scheduledCharge;
        const trimmedScheduledChargeName = name?.trim();
        cleaned.scheduledCharge = {
          ...(trimmedScheduledChargeName
            ? { name: trimmedScheduledChargeName }
            : {}),
          invoiceAmount,
          paymentSchedule,
        };
      }
      // Recurring free credit pool: only sent when the operator toggled the
      // section on. No invoice involved, so no Stripe customer is required.
      if (values.recurringFreeCredit !== undefined) {
        cleaned.recurringFreeCredit = values.recurringFreeCredit;
      }
      // Promotional free period: only sent when a positive duration is entered.
      if (offerValue > 0) {
        cleaned.offerFreePeriod = { value: offerValue, unit: offerUnit };
      }
      // Resolve the start moment. "immediately" leaves `startingAt` unset so
      // the server swaps at the current hour.
      if (values.startMode === "retroactive_first_of_month") {
        cleaned.startingAt = retroactiveFirstOfMonthISO;
      } else if (values.startMode === "select" && values.startingAt) {
        // datetime-local has no timezone — append Z to interpret as UTC.
        cleaned.startingAt = new Date(values.startingAt + ":00Z").toISOString();
      }
      if (values.endingAt) {
        // datetime-local has no timezone — append Z to interpret as UTC.
        cleaned.endingAt = new Date(values.endingAt + ":00Z").toISOString();
      }
      // Resolve the commitment window (mirrors the display memos) so the default
      // seat commitment price is prorated to the contract, not a fixed year.
      const commitStart =
        values.startMode === "retroactive_first_of_month"
          ? new Date(retroactiveFirstOfMonthISO)
          : values.startMode === "select" && values.startingAt
            ? new Date(values.startingAt + ":00Z")
            : floorToHourUTC(new Date());
      const commitEnd = values.endingAt
        ? new Date(values.endingAt + ":00Z")
        : undefined;
      const commitPeriodEnd = commitmentPeriodEnd(commitStart, commitEnd);
      // Seats: every seat the package knows about, each carrying its `selected`
      // state, so the server can entitle checked seats and disable unchecked
      // ones the package would otherwise sell. Entitled-by-default seats are
      // pre-checked. A checked seat the package does not entitle requires a
      // positive rate (except the free seat, which may be entitled at rate 0).
      const seats: NonNullable<SwitchContractBodyInput["seats"]> = {};
      for (const { seatType, entitled } of selectedSeats) {
        const entry = values.seats?.[seatType];
        const selected = entry?.selected ?? false;
        const minSeats = Number.isFinite(entry?.minSeats)
          ? (entry?.minSeats ?? 0)
          : 0;
        const maxSeats =
          typeof entry?.maxSeats === "number" && Number.isFinite(entry.maxSeats)
            ? entry.maxSeats
            : undefined;
        const rate = Number.isFinite(entry?.rate) ? (entry?.rate ?? 0) : 0;
        // If the operator left commitment price blank, default to the
        // commitment period prorated in months (see `commitmentInvoiceAmount`).
        const explicitPrice =
          typeof entry?.commitmentPrice === "number" &&
          Number.isFinite(entry.commitmentPrice) &&
          entry.commitmentPrice >= 0
            ? entry.commitmentPrice
            : null;
        const commitmentPrice =
          explicitPrice ??
          (minSeats > 0 && rate > 0
            ? Math.round(
                commitmentAmount({
                  minSeats,
                  ratePerPeriod: rate,
                  isAnnual: seatType.endsWith("_yearly"),
                  start: commitStart,
                  end: commitPeriodEnd,
                }) * 100
              ) / 100
            : undefined);
        // Periods-when-not-one-time is enforced by `paymentScheduleSchema`'s
        // own refine, so it's guaranteed present here whenever needed.
        const paymentSchedule = entry?.paymentSchedule ?? {
          frequency: "one_time" as const,
        };
        if (selected && !entitled && seatType !== "free" && !(rate > 0)) {
          setError(
            `Seat "${seatType}" is not entitled by the selected package and ` +
              "requires a rate greater than 0 to entitle it."
          );
          return;
        }
        seats[seatType] = {
          selected,
          minSeats,
          maxSeats,
          rate,
          commitmentPrice,
          paymentSchedule,
        };
      }
      if (Object.keys(seats).length > 0) {
        cleaned.seats = seats;
      }

      const submit = async () => {
        setIsSubmitting(true);
        setError(null);
        try {
          const r = await clientFetch(
            `/api/poke/workspaces/${owner.sId}/switch_contract`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(cleaned),
            }
          );
          if (!r.ok) {
            throw new Error(
              `Something went wrong: ${r.status} ${await r.text()}`
            );
          }
          form.reset();
          setOpen(false);
          router.reload();
        } catch (e) {
          setIsSubmitting(false);
          if (e instanceof Error) {
            setError(e.message);
          }
        }
      };
      void submit();
    },
    [
      form,
      owner.sId,
      router,
      selectedSeats,
      retroactiveFirstOfMonthISO,
      offerValue,
      offerUnit,
    ]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset the transient selections when the dialog closes.
        if (!next) {
          setOfferValue(0);
          setOfferUnit("weeks");
          setAppliedTemplateName(null);
          pendingTemplateRef.current = null;
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" label="🔁 Switch contract" />
      </DialogTrigger>
      <DialogContent className="bg-primary-50 sm:h-[90vh] sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle>Switch contract for {owner.name}</DialogTitle>
          <DialogDescription>
            Pick the Metronome package and target plan. Enterprise and Business
            packages let you choose a start time.
          </DialogDescription>
        </DialogHeader>
        {isSubmitting ? (
          <DialogContainer>
            <div className="flex justify-center">
              <Spinner size="lg" />
            </div>
          </DialogContainer>
        ) : (
          <PokeForm {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              style={{ display: "contents" }}
            >
              <DialogContainer>
                <div className="grid grid-cols-[200px_1fr] items-center gap-x-4 gap-y-2">
                  {error && (
                    <div className="col-span-2 text-warning">{error}</div>
                  )}
                  <Label className="text-sm">
                    Stripe Customer ID
                    <span className="ml-1 text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <InputField
                    control={form.control}
                    name="stripeCustomerId"
                    hideLabel
                    placeholder="cus_1234567890 — leave blank for no Stripe billing"
                  />
                  {hasStripeCustomer && isCurrencyLoading && (
                    <div className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Spinner size="sm" />
                      <span>Resolving customer currency...</span>
                    </div>
                  )}
                  {hasStripeCustomer && currencyError && (
                    <div className="col-span-2 text-sm text-warning">
                      Failed to resolve currency from Stripe customer:{" "}
                      {currencyError.message}
                    </div>
                  )}
                  {!hasStripeCustomer && (
                    <>
                      <Label className="text-sm">Billing currency</Label>
                      <SelectField
                        control={form.control}
                        name="manualCurrency"
                        hideLabel
                        mountPortalContainer={portalContainer}
                        options={SUPPORTED_CURRENCIES.map((currency) => ({
                          value: currency,
                          display: currency.toUpperCase(),
                        }))}
                      />
                      <div className="col-span-2 text-xs text-muted-foreground">
                        No Stripe customer: Metronome still raises invoices for
                        initial credits, scheduled charges, and seat commitments
                        as usual — they just won't be pushed to Stripe (nothing
                        is auto-charged; reconcile manually).
                      </div>
                    </>
                  )}
                </div>
                {/* Nothing else renders until a Stripe customer resolves to a
                    valid billing currency — there is no package, seat, or
                    credit configuration to show for an unresolved customer. */}
                {resolvedCurrency && (
                  <>
                    <div className="grid grid-cols-[200px_1fr] items-center gap-x-4 gap-y-2">
                      <Label className="text-sm">
                        Template
                        <span className="ml-1 text-muted-foreground">
                          (optional)
                        </span>
                      </Label>
                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              isSelect
                              disabled={isPackagesLoading}
                              label={
                                appliedTemplateName ?? "Select a template…"
                              }
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            mountPortalContainer={portalContainer}
                          >
                            {SWITCH_CONTRACT_TEMPLATES.map((template) => (
                              <DropdownMenuItem
                                key={template.id}
                                label={template.name}
                                description={template.description}
                                onClick={() => applyTemplate(template)}
                              />
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <span className="text-xs text-muted-foreground">
                          Pre-fills the form; every field stays editable.
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-[200px_1fr] items-center gap-x-4 gap-y-2">
                      <Label className="text-sm">
                        HubSpot Deal ID
                        <span className="ml-1 text-muted-foreground">
                          (optional)
                        </span>
                      </Label>
                      <InputField
                        control={form.control}
                        name="hubspotDealId"
                        hideLabel
                        placeholder="e.g., 12345678901"
                      />
                      <Label className="text-sm">
                        Purchase order
                        <span className="ml-1 text-muted-foreground">
                          (optional)
                        </span>
                      </Label>
                      <InputField
                        control={form.control}
                        name="purchaseOrderId"
                        hideLabel
                        placeholder="PO number"
                      />
                      {hasStripeCustomer && (
                        <>
                          <Label className="text-sm">Collection method</Label>
                          <SelectField
                            control={form.control}
                            name="stripeCollectionMethod"
                            hideLabel
                            mountPortalContainer={portalContainer}
                            options={[
                              {
                                value: "charge_automatically",
                                display: "Charge automatically (card on file)",
                              },
                              {
                                value: "send_invoice",
                                display: "Send invoice (manual payment)",
                              },
                            ]}
                          />
                          {stripeCollectionMethod === "send_invoice" && (
                            <>
                              <Label className="text-sm">
                                Net payment terms (days)
                              </Label>
                              <InputField
                                control={form.control}
                                name="netPaymentTermsDays"
                                hideLabel
                                type="number"
                                placeholder="Metronome account default"
                              />
                            </>
                          )}
                        </>
                      )}
                      {isPackagesLoading && (
                        <div className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                          <Spinner size="sm" />
                          <span>Loading Metronome packages...</span>
                        </div>
                      )}
                      {!isPackagesLoading && packagesError && (
                        <div className="col-span-2 text-sm text-warning">
                          Failed to load Metronome packages:{" "}
                          {packagesError.message}
                        </div>
                      )}
                      {!isPackagesLoading && !packagesError && (
                        <>
                          <Label className="text-sm">
                            Package ({resolvedCurrency.toUpperCase()})
                          </Label>
                          <SelectField
                            control={form.control}
                            name="metronomePackageId"
                            hideLabel
                            mountPortalContainer={portalContainer}
                            groups={packageGroups}
                          />
                        </>
                      )}
                      {selectedTier === "enterprise" && (
                        <>
                          <Label className="text-sm">Enterprise plan</Label>
                          <SelectField
                            control={form.control}
                            name="planCode"
                            hideLabel
                            mountPortalContainer={portalContainer}
                            options={enterprisePlanOptions}
                          />
                        </>
                      )}
                      {selectedTier === "business" && (
                        <>
                          <Label className="text-sm">Business plan</Label>
                          <SelectField
                            control={form.control}
                            name="planCode"
                            hideLabel
                            mountPortalContainer={portalContainer}
                            options={businessPlanOptions}
                          />
                        </>
                      )}
                      {(selectedTier === "enterprise" ||
                        selectedTier === "business") && (
                        <>
                          <Label className="text-sm">Start</Label>
                          <SelectField
                            control={form.control}
                            name="startMode"
                            hideLabel
                            mountPortalContainer={portalContainer}
                            options={startModeOptions}
                          />
                          {startMode === "select" && (
                            <>
                              <Label className="text-sm">Starts at (UTC)</Label>
                              <div className="relative">
                                <InputField
                                  control={form.control}
                                  name="startingAt"
                                  hideLabel
                                  type="datetime-local"
                                  step={3600}
                                  transformValue={snapDatetimeLocalToHour}
                                />
                                {startingAtLocalLabel && (
                                  <p className="mt-1 text-xs text-muted-foreground absolute top-2 right-2">
                                    Local: {startingAtLocalLabel}
                                  </p>
                                )}
                              </div>
                            </>
                          )}
                          <Label className="text-sm">
                            Ends at (UTC)
                            <span className="ml-1 text-muted-foreground">
                              (optional)
                            </span>
                          </Label>
                          <div className="relative">
                            <div className="relative">
                              <InputField
                                control={form.control}
                                name="endingAt"
                                hideLabel
                                type="datetime-local"
                                step={3600}
                                placeholder="open-ended"
                                disabled={durationMode}
                                transformValue={snapDatetimeLocalToHour}
                              />
                              {endingAtLocalLabel && (
                                <p className="mt-1 text-xs text-muted-foreground absolute top-2 right-2">
                                  Local: {endingAtLocalLabel}
                                </p>
                              )}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <SliderToggle
                                selected={durationMode}
                                onClick={() => setDurationMode((v) => !v)}
                              />
                              <span className="text-xs text-muted-foreground">
                                Set duration
                              </span>
                              {durationMode && (
                                <PeriodField
                                  value={durationValue}
                                  unit={durationUnit}
                                  onValueChange={setDurationValue}
                                  onUnitChange={setDurationUnit}
                                  portalContainer={portalContainer}
                                />
                              )}
                            </div>
                          </div>
                          {commitmentPeriodInfo && (
                            <>
                              <Label className="text-sm">
                                Commitment period
                              </Label>
                              <div className="text-sm text-muted-foreground">
                                {commitmentPeriodInfo.openEnded
                                  ? "1 year (open-ended contract)"
                                  : `${commitmentPeriodInfo.months.toFixed(1)} months (contract start → end)`}
                                . Drives the default seat commitment prices
                                below.
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                    {selectedTier && (
                      <div className="border-t pt-4">
                        <Label className="mb-3 block text-sm font-medium">
                          Credit configuration
                        </Label>
                        <div className="grid grid-cols-[200px_1fr] items-center gap-x-4 gap-y-2">
                          {paygEligible && selectedTier === "enterprise" && (
                            <>
                              <Label className="text-sm">Pay-as-you-go</Label>
                              <SliderToggle
                                selected={paygEnabled}
                                onClick={() =>
                                  form.setValue("paygEnabled", !paygEnabled)
                                }
                              />
                            </>
                          )}
                          <Label className="text-sm">
                            Monthly usage cap (credits)
                          </Label>
                          <InputField
                            control={form.control}
                            name="usageCapCredits"
                            hideLabel
                            type="number"
                            placeholder="no cap"
                          />
                          <Label className="text-sm">
                            Default discount (%)
                          </Label>
                          <InputField
                            control={form.control}
                            name="defaultDiscountPercent"
                            hideLabel
                            type="number"
                            placeholder="0"
                          />
                          <Label className="text-sm">
                            Workspace credit pool threshold alert (credits)
                          </Label>
                          <InputField
                            control={form.control}
                            name="balanceThresholdCredits"
                            hideLabel
                            type="number"
                            placeholder="no alert"
                          />
                          <Label className="text-sm">
                            Default per-user workspace credit pool monthly limit
                            (credits)
                          </Label>
                          <InputField
                            control={form.control}
                            name="defaultPoolCapCredits"
                            hideLabel
                            type="number"
                            placeholder="no access"
                          />
                          <Label className="text-sm">
                            Programmatic monthly limit (credits)
                          </Label>
                          <InputField
                            control={form.control}
                            name="programmaticMonthlyCapCredits"
                            hideLabel
                            type="number"
                            placeholder="no cap"
                          />
                          <Label className="text-sm">Auto-upgrade seats</Label>
                          <SliderToggle
                            selected={autoSeatUpgradeEnabled}
                            onClick={() =>
                              form.setValue(
                                "autoSeatUpgradeEnabled",
                                !autoSeatUpgradeEnabled
                              )
                            }
                          />
                          {selectedTier === "enterprise" && (
                            <>
                              <Label className="text-sm">
                                Top-up (Enterprise)
                              </Label>
                              <SliderToggle
                                selected={topUpEnabled}
                                onClick={() =>
                                  form.setValue("topUpEnabled", !topUpEnabled)
                                }
                              />
                            </>
                          )}
                          <Label className="text-sm">
                            Auto invoice finalization
                          </Label>
                          <SliderToggle
                            selected={autoInvoiceFinalizationEnabled}
                            onClick={() =>
                              form.setValue(
                                "autoInvoiceFinalizationEnabled",
                                !autoInvoiceFinalizationEnabled
                              )
                            }
                          />
                        </div>
                      </div>
                    )}
                    {selectedSeats.length > 0 && (
                      <div className="space-y-2 border-t pt-4">
                        <Label className="text-sm">
                          Seats configuration{" "}
                          {resolvedCurrency
                            ? `(rate & price in ${resolvedCurrency.toUpperCase()})`
                            : ""}
                        </Label>
                        <div className="text-xs text-muted-foreground">
                          Checked seats are entitled on the new contract. Seats
                          the package does not entitle by default are unchecked
                          — check one to entitle it (a non-zero rate is
                          required, except for the free seat).
                        </div>
                        {/* Header row */}
                        <div className="flex items-center gap-3 pb-1 text-xs font-medium text-muted-foreground">
                          <div className="w-32 shrink-0" />
                          <div className="flex-1">Commitment</div>
                          <div className="flex-1">Max</div>
                          <div className="flex-1">
                            Seat rate
                            {resolvedCurrency
                              ? ` (${resolvedCurrency.toUpperCase()})`
                              : ""}
                          </div>
                          <div className="flex-1">
                            Commitment price
                            {resolvedCurrency
                              ? ` (${resolvedCurrency.toUpperCase()})`
                              : ""}
                          </div>
                          <div className="flex-1">Payment schedule</div>
                          <div className="flex-1">Periods</div>
                        </div>
                        {selectedSeats.map(({ seatType, entitled }) => {
                          const isSelected =
                            watchedSeats?.[seatType]?.selected ?? false;
                          const seatPaymentFrequency =
                            watchedSeats?.[seatType]?.paymentSchedule
                              ?.frequency ?? "one_time";
                          const minSeats =
                            watchedSeats?.[seatType]?.minSeats ?? 0;
                          const rate = watchedSeats?.[seatType]?.rate ?? 0;
                          const isAnnualSeat = seatType.endsWith("_yearly");
                          const defaultCommitment =
                            commitmentPeriodInfo && minSeats > 0 && rate > 0
                              ? Math.round(
                                  commitmentAmount({
                                    minSeats,
                                    ratePerPeriod: rate,
                                    isAnnual: isAnnualSeat,
                                    start: commitmentPeriodInfo.start,
                                    end: commitmentPeriodInfo.end,
                                  }) * 100
                                ) / 100
                              : null;
                          const monthlyRate =
                            isAnnualSeat && rate > 0 ? rate / 12 : null;
                          const maxPeriods =
                            commitmentPeriodInfo &&
                            seatPaymentFrequency !== "one_time"
                              ? maxInvoicePeriods(
                                  commitmentPeriodInfo.start,
                                  commitmentPeriodInfo.end,
                                  seatPaymentFrequency
                                )
                              : undefined;
                          return (
                            <div
                              key={seatType}
                              className="flex items-center gap-3"
                            >
                              <div className="flex w-32 shrink-0 items-center gap-2">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) =>
                                    form.setValue(
                                      `seats.${seatType}.selected`,
                                      checked === true
                                    )
                                  }
                                />
                                <span className="font-mono text-sm">
                                  {seatType}
                                  {!entitled && (
                                    <span className="ml-1 text-muted-foreground">
                                      *
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="flex-1">
                                <InputField
                                  control={form.control}
                                  name={`seats.${seatType}.minSeats`}
                                  hideLabel
                                  type="number"
                                  placeholder="0"
                                  disabled={!isSelected}
                                />
                              </div>
                              <div className="flex-1">
                                <InputField
                                  control={form.control}
                                  name={`seats.${seatType}.maxSeats`}
                                  hideLabel
                                  type="number"
                                  min="1"
                                  placeholder="∞"
                                  disabled={!isSelected}
                                />
                              </div>
                              <div className="flex-1 relative">
                                <InputField
                                  control={form.control}
                                  name={`seats.${seatType}.rate`}
                                  hideLabel
                                  type="number"
                                  placeholder="0"
                                  disabled={!isSelected}
                                />
                                {isSelected && monthlyRate !== null && (
                                  <p className="mt-0.5 text-xs text-muted-foreground absolute top-2 right-2">
                                    {monthlyRate % 1 === 0
                                      ? monthlyRate
                                      : monthlyRate.toFixed(2)}
                                    /mo
                                  </p>
                                )}
                              </div>
                              <div className="flex-1">
                                <InputField
                                  control={form.control}
                                  name={`seats.${seatType}.commitmentPrice`}
                                  hideLabel
                                  type="number"
                                  placeholder={
                                    rate <= 0
                                      ? "n/a (rate is 0)"
                                      : defaultCommitment !== null
                                        ? String(defaultCommitment)
                                        : "optional"
                                  }
                                  disabled={!isSelected || rate <= 0}
                                />
                              </div>
                              <div className="flex-1">
                                <SelectField
                                  control={form.control}
                                  name={`seats.${seatType}.paymentSchedule.frequency`}
                                  hideLabel
                                  mountPortalContainer={portalContainer}
                                  options={[
                                    { value: "one_time", display: "One-time" },
                                    { value: "monthly", display: "Monthly" },
                                    {
                                      value: "quarterly",
                                      display: "Quarterly",
                                    },
                                    {
                                      value: "semi_annually",
                                      display: "Semi-annually",
                                    },
                                    { value: "annually", display: "Annually" },
                                  ]}
                                />
                              </div>
                              <div className="flex-1">
                                {seatPaymentFrequency !== "one_time" && (
                                  <InputField
                                    control={form.control}
                                    name={`seats.${seatType}.paymentSchedule.periods`}
                                    hideLabel
                                    type="number"
                                    min="1"
                                    max={
                                      maxPeriods !== undefined
                                        ? String(maxPeriods)
                                        : undefined
                                    }
                                    placeholder="e.g., 4"
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex flex-col gap-1 border-t pt-3">
                          <div className="grid grid-cols-[200px_1fr] items-center gap-x-4 gap-y-2">
                            <Label className="text-sm font-medium">
                              Force seat type
                            </Label>
                            <SliderToggle
                              selected={promoteNoneSeatsTo !== undefined}
                              disabled={enterableSeatTypes.length === 0}
                              onClick={() =>
                                form.setValue(
                                  "promoteNoneSeatsTo",
                                  promoteNoneSeatsTo !== undefined
                                    ? undefined
                                    : enterableSeatTypes[0]
                                )
                              }
                            />
                            {promoteNoneSeatsTo !== undefined && (
                              <>
                                <Label className="text-sm">Seat type</Label>
                                <div className="w-64">
                                  <SelectField
                                    control={form.control}
                                    name="promoteNoneSeatsTo"
                                    hideLabel
                                    mountPortalContainer={portalContainer}
                                    options={enterableSeatTypes.map(
                                      (seatType) => ({
                                        value: seatType,
                                        display: seatType,
                                      })
                                    )}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Forces every seat-less ("none") member onto this
                            seat on the new contract, preempting committed-seat
                            placement.
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="border-t pt-4">
                      <div className="grid grid-cols-[200px_1fr] items-center gap-x-4 gap-y-2">
                        <Label className="text-sm font-medium">
                          Initial credits (prepaid commit)
                        </Label>
                        <SliderToggle
                          selected={initialCredits !== undefined}
                          onClick={() =>
                            form.setValue(
                              "initialCredits",
                              initialCredits !== undefined
                                ? undefined
                                : {
                                    amountCredits: 0,
                                    invoiceAmount: 0,
                                    paymentSchedule: {
                                      frequency: "one_time",
                                    },
                                  }
                            )
                          }
                        />
                        {initialCredits !== undefined && (
                          <>
                            <Label className="text-sm">Credits (AWU)</Label>
                            <InputField
                              control={form.control}
                              name="initialCredits.amountCredits"
                              hideLabel
                              type="number"
                              placeholder="e.g., 100000"
                            />
                            <Label className="text-sm">
                              Invoice ({resolvedCurrency.toUpperCase()})
                            </Label>
                            <InputField
                              control={form.control}
                              name="initialCredits.invoiceAmount"
                              hideLabel
                              type="number"
                              placeholder="e.g., 5000"
                            />
                            <Label className="text-sm">Payment schedule</Label>
                            <SelectField
                              control={form.control}
                              name="initialCredits.paymentSchedule.frequency"
                              hideLabel
                              mountPortalContainer={portalContainer}
                              options={[
                                {
                                  value: "one_time",
                                  display: "One-time",
                                },
                                { value: "monthly", display: "Monthly" },
                                {
                                  value: "quarterly",
                                  display: "Quarterly",
                                },
                                {
                                  value: "semi_annually",
                                  display: "Semi-annually",
                                },
                                { value: "annually", display: "Annually" },
                              ]}
                            />
                            {initialCredits.paymentSchedule.frequency !==
                              "one_time" && (
                              <>
                                <Label className="text-sm">Periods</Label>
                                <InputField
                                  control={form.control}
                                  name="initialCredits.paymentSchedule.periods"
                                  hideLabel
                                  type="number"
                                  placeholder="e.g., 4"
                                />
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="border-t pt-4">
                      <div className="grid grid-cols-[200px_1fr] items-center gap-x-4 gap-y-2">
                        <Label className="text-sm font-medium">
                          Scheduled charge (platform fee)
                        </Label>
                        <SliderToggle
                          selected={scheduledCharge !== undefined}
                          onClick={() =>
                            form.setValue(
                              "scheduledCharge",
                              scheduledCharge !== undefined
                                ? undefined
                                : {
                                    name: undefined,
                                    invoiceAmount: 0,
                                    paymentSchedule: {
                                      frequency: "one_time",
                                    },
                                  }
                            )
                          }
                        />
                        {scheduledCharge !== undefined && (
                          <>
                            <Label className="text-sm">
                              Name
                              <span className="ml-1 text-muted-foreground">
                                (optional)
                              </span>
                            </Label>
                            <InputField
                              control={form.control}
                              name="scheduledCharge.name"
                              hideLabel
                              placeholder="Platform fee"
                            />
                            <Label className="text-sm">
                              Amount ({resolvedCurrency.toUpperCase()})
                            </Label>
                            <InputField
                              control={form.control}
                              name="scheduledCharge.invoiceAmount"
                              hideLabel
                              type="number"
                              placeholder="e.g., 5000"
                            />
                            <Label className="text-sm">Payment schedule</Label>
                            <SelectField
                              control={form.control}
                              name="scheduledCharge.paymentSchedule.frequency"
                              hideLabel
                              mountPortalContainer={portalContainer}
                              options={[
                                {
                                  value: "one_time",
                                  display: "One-time",
                                },
                                { value: "monthly", display: "Monthly" },
                                {
                                  value: "quarterly",
                                  display: "Quarterly",
                                },
                                {
                                  value: "semi_annually",
                                  display: "Semi-annually",
                                },
                                { value: "annually", display: "Annually" },
                              ]}
                            />
                            {scheduledCharge.paymentSchedule.frequency !==
                              "one_time" && (
                              <>
                                <Label className="text-sm">Periods</Label>
                                <InputField
                                  control={form.control}
                                  name="scheduledCharge.paymentSchedule.periods"
                                  hideLabel
                                  type="number"
                                  placeholder="e.g., 4"
                                />
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="border-t pt-4">
                      <div className="grid grid-cols-[200px_1fr] items-center gap-x-4 gap-y-2">
                        <Label className="text-sm font-medium">
                          Recurring free credit pool (monthly)
                        </Label>
                        <SliderToggle
                          selected={recurringFreeCredit !== undefined}
                          onClick={() =>
                            form.setValue(
                              "recurringFreeCredit",
                              recurringFreeCredit !== undefined ? undefined : 0
                            )
                          }
                        />
                        {recurringFreeCredit !== undefined && (
                          <>
                            <Label className="text-sm">
                              Credits (AWU) / month
                            </Label>
                            <InputField
                              control={form.control}
                              name="recurringFreeCredit"
                              hideLabel
                              type="number"
                              placeholder="e.g., 10000"
                            />
                          </>
                        )}
                      </div>
                    </div>
                    <div className="border-t pt-4">
                      <div className="grid grid-cols-[200px_1fr] items-center gap-x-4 gap-y-2">
                        <Label className="text-sm font-medium">
                          Offer free period
                        </Label>
                        <PeriodField
                          value={offerValue}
                          unit={offerUnit}
                          onValueChange={(v) => setOfferValue(Math.max(0, v))}
                          onUnitChange={setOfferUnit}
                          portalContainer={portalContainer}
                          min={0}
                        />
                        <div className="col-span-2 text-xs text-muted-foreground">
                          Reduces every seat commitment's earliest bill(s) by
                          the prorated value of this leading period, so the
                          customer pays nothing for it. Leave at 0 for no offer.
                          The granted seats are unchanged.
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </DialogContainer>
              <DialogFooter>
                <Button
                  type="submit"
                  variant="warning"
                  label="Switch"
                  disabled={!selectedTier || !resolvedCurrency}
                />
              </DialogFooter>
            </form>
          </PokeForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
