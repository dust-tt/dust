import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import {
  InputField,
  SelectField,
} from "@app/components/poke/shadcn/ui/form/fields";
import type { SwitchContractBodySchema } from "@app/lib/api/poke/switch_contract";
import { clientFetch } from "@app/lib/egress/client";
import { amountCents } from "@app/lib/metronome/amounts";
import { isPaygEligibleTier } from "@app/lib/metronome/types";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  CREDIT_PRICED_FREE_PLAN_CODE,
  isEnterprisePlanPrefix,
  PRO_PLAN_SEAT_29_CODE,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import {
  usePokeMetronomePackages,
  usePokePlans,
  usePokeStripeCustomerCurrency,
} from "@app/lib/swr/poke";
import assert from "@app/lib/utils/assert";
import { isCreditPricedPlan } from "@app/types/plan";
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
  Label,
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const SwitchContractFormSchema = z.object({
  metronomePackageId: z.string().min(1, "Required"),
  planCode: z.string().min(1, "Required"),
  startingAt: z.string().optional(),
  // How the enterprise contract's start moment is resolved:
  //  - "immediately": swap at the current hour (no startingAt sent).
  //  - "retroactive_first_of_month": backdate to the 1st of the current month,
  //    00:00 UTC.
  //  - "select": use the operator-chosen `startingAt` (the only mode that
  //    surfaces the date picker).
  startMode: z
    .enum(["immediately", "retroactive_first_of_month", "select"])
    .default("select"),
  stripeCustomerId: z.string(),
  stripeCollectionMethod: z
    .enum(["charge_automatically", "send_invoice"])
    .default("charge_automatically"),
  // Net payment terms in days (e.g. 30 for "Net 30"). Only relevant for
  // `send_invoice`; empty leaves Metronome's account default in place.
  netPaymentTermsDays: z
    .number()
    .int("Net payment terms must be a whole number of days")
    .min(0, "Net payment terms must be ≥ 0")
    .max(365, "Net payment terms must be ≤ 365")
    .optional(),
  paygEnabled: z.boolean().default(false),
  usageCapCredits: z
    .number()
    .int("Usage cap must be an integer number of credits")
    .min(1, "Usage cap must be at least 1 credit")
    .optional(),
  // One-off initial credits (contract-level prepaid commit). Toggled on via
  // `showInitialCredits`; both fields are then required together and assembled
  // into `initialCredits` on submit.
  showInitialCredits: z.boolean().default(false),
  initialCreditsAmount: z
    .number()
    .int("Initial credits must be an integer number of credits")
    .min(1, "Initial credits must be at least 1 credit")
    .optional(),
  initialCreditsInvoiceAmount: z
    .number()
    .min(0, "Invoice amount must be zero or more")
    .optional(),
  // Per-seat-type settings, keyed by seat type. Every seat type the selected
  // package knows about is shown; only `selected` ones are submitted. `selected`
  // is pre-checked for the seats the package entitles by default, and can be
  // toggled to opt into entitling additional seats. `minSeats` is the billing
  // floor (0 = none); `rate` is the per-seat rate, prefilled from the package
  // override default; `commitmentPrice` (optional) creates a prepaid commit of
  // `minSeats * rate` invoiced at that price.
  seats: z
    .record(
      z.string(),
      z.object({
        selected: z.boolean().default(false),
        minSeats: z.number().int().min(0),
        rate: z.number().min(0),
        commitmentPrice: z.number().min(0).optional(),
      })
    )
    .default({}),
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

const isLegacyPackageName = (name: string) => /\blegacy\b/i.test(name);

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

  // Default datetime seeded into the enterprise startingAt field: the next
  // local hour boundary (≥1h from now). The operator may freely change it to
  // any moment, including the past — there is no enforced minimum.
  const defaultStartingAtLocal = useMemo(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) {
      d.setHours(d.getHours() + 1);
    }
    d.setMinutes(0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:00`
    );
  }, []);

  // No prefilled usage cap: the legacy `programmatic_usage_configuration.paygCapMicroUsd`
  // is for the programmatic-usage / Stripe flow and must not be read here.
  // The credit-priced usage cap lives on `credit_usage_configuration.usageCapCredits`
  // and is managed via the "Manage Credit Usage Configuration" plugin — operators
  // enter the desired cap (in AWU credits) fresh when switching contracts.
  const form = useForm<SwitchContractFormValues>({
    resolver: zodResolver(SwitchContractFormSchema),
    defaultValues: {
      metronomePackageId: "",
      planCode: "",
      startingAt: "",
      startMode: "select",
      stripeCustomerId: stripeCustomerId ?? "",
      stripeCollectionMethod: "charge_automatically",
      netPaymentTermsDays: undefined,
      paygEnabled: false,
      usageCapCredits: undefined,
      showInitialCredits: false,
      initialCreditsAmount: undefined,
      initialCreditsInvoiceAmount: undefined,
      seats: {},
    },
  });

  const watchedStripeCustomerId = form.watch("stripeCustomerId");
  const trimmedStripeCustomerId = watchedStripeCustomerId.trim() || null;
  const {
    currency: resolvedCurrency,
    isCurrencyLoading,
    currencyError,
  } = usePokeStripeCustomerCurrency({
    stripeCustomerId: trimmedStripeCustomerId,
    disabled: !open,
  });

  // Split packages into Current vs Legacy sections (name contains "legacy",
  // case-insensitive). Each section preserves the lib-side sort order.
  // Free-tier packages are currency-agnostic (price is 0) and surface
  // regardless of the resolved Stripe currency.
  const packageGroups = useMemo(() => {
    const visible = metronomePackages.filter(
      (p) => p.tier === "free" || p.currency === resolvedCurrency
    );
    const toOption = (p: (typeof visible)[number]) => ({
      value: p.id,
      display:
        p.tier === "free"
          ? `${p.name} (${p.tier})`
          : `${p.name} (${p.tier}, ${p.currency.toUpperCase()})`,
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
  const selectedName = selectedPackage?.name ?? null;
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
    const next: Record<
      string,
      { selected: boolean; minSeats: number; rate: number }
    > = {};
    for (const seat of selectedSeats) {
      const rate =
        seat.defaultRate != null && resolvedCurrency
          ? amountCents(seat.defaultRate, resolvedCurrency) / 100
          : (seat.defaultRate ?? 0);
      next[seat.seatType] = { selected: seat.entitled, minSeats: 0, rate };
    }
    form.setValue("seats", next);
  }, [selectedSeats, form, resolvedCurrency]);

  // Clear a stale package selection when the resolved currency changes so a
  // previously-picked package can't survive a currency switch silently. Free
  // packages are currency-agnostic and exempt from this check.
  useEffect(() => {
    if (
      resolvedCurrency &&
      selectedPackage &&
      selectedPackage.tier !== "free" &&
      selectedPackage.currency !== resolvedCurrency
    ) {
      form.setValue("metronomePackageId", "");
    }
  }, [resolvedCurrency, selectedPackage, form]);

  // When the operator picks a package, derive (Pro/Business) or reset
  // (Enterprise) the plan code. The full list of ENT_* plans is offered for
  // enterprise; pro/business map to a single plan code. PAYG is force-disabled
  // for tiers that don't support it (currently: pro).
  useEffect(() => {
    if (selectedTier === "pro") {
      if (isLegacyPackageName(selectedName ?? "")) {
        form.setValue("planCode", PRO_PLAN_SEAT_29_CODE);
      } else {
        assert("There is no non-legacy pro plan");
      }
      form.setValue("startingAt", "");
      form.setValue("startMode", "select");
    } else if (selectedTier === "business") {
      if (isLegacyPackageName(selectedName ?? "")) {
        form.setValue("planCode", PRO_PLAN_SEAT_39_CODE);
      } else {
        form.setValue("planCode", CREDIT_PRICED_BUSINESS_PLAN_CODE);
      }
      form.setValue("startingAt", "");
      form.setValue("startMode", "select");
    } else if (selectedTier === "enterprise") {
      form.setValue("planCode", "");
      form.setValue("startingAt", defaultStartingAtLocal);
      form.setValue("startMode", "select");
    } else if (selectedTier === "free") {
      form.setValue("planCode", CREDIT_PRICED_FREE_PLAN_CODE);
      form.setValue("startingAt", "");
      form.setValue("startMode", "select");
    }
    if (selectedTier && !isPaygEligibleTier(selectedTier)) {
      form.setValue("paygEnabled", false);
      form.setValue("usageCapCredits", undefined);
    }
  }, [selectedTier, selectedName, form, defaultStartingAtLocal]);

  const startMode = form.watch("startMode");

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

  const paygEnabled = form.watch("paygEnabled");
  const paygEligible =
    selectedTier !== null && isPaygEligibleTier(selectedTier);

  const showInitialCredits = form.watch("showInitialCredits");
  const stripeCollectionMethod = form.watch("stripeCollectionMethod");
  const watchedSeats = form.watch("seats");

  const onSubmit = useCallback(
    (values: SwitchContractFormValues) => {
      const trimmedStripe = values.stripeCustomerId.trim();
      const cleaned: SwitchContractBodyInput = {
        metronomePackageId: values.metronomePackageId.trim(),
        planCode: values.planCode.trim(),
        paygEnabled: values.paygEnabled,
      };
      // For free-tier switches, the operator can omit the Stripe customer —
      // the resulting Metronome contract has no Stripe billing link. The
      // collection method only matters when a Stripe customer is wired in.
      if (trimmedStripe) {
        cleaned.stripeCustomerId = trimmedStripe;
        cleaned.stripeCollectionMethod = values.stripeCollectionMethod;
      }
      if (values.netPaymentTermsDays !== undefined) {
        cleaned.netPaymentTermsDays = values.netPaymentTermsDays;
      }
      if (values.usageCapCredits !== undefined) {
        cleaned.usageCapCredits = values.usageCapCredits;
      }
      // Initial credits: only sent when the operator toggled the section on.
      // Both the credit amount and the invoice amount are then required, and a
      // Stripe customer must be present to invoice against.
      if (values.showInitialCredits) {
        if (
          values.initialCreditsAmount === undefined ||
          values.initialCreditsInvoiceAmount === undefined
        ) {
          setError(
            "Initial credits require both a credit amount and an invoice amount."
          );
          return;
        }
        if (!trimmedStripe) {
          setError("Initial credits require a Stripe customer to invoice.");
          return;
        }
        cleaned.initialCredits = {
          amountCredits: values.initialCreditsAmount,
          invoiceAmount: values.initialCreditsInvoiceAmount,
        };
      }
      // Resolve the start moment for enterprise. "immediately" leaves
      // `startingAt` unset so the server swaps at the current hour.
      if (selectedTier === "enterprise") {
        if (values.startMode === "retroactive_first_of_month") {
          cleaned.startingAt = retroactiveFirstOfMonthISO;
        } else if (values.startMode === "select" && values.startingAt) {
          // datetime-local strings have no timezone — convert to ISO so the
          // server's Date.parse is unambiguous.
          cleaned.startingAt = new Date(values.startingAt).toISOString();
        }
      }
      // Seats: every seat the package knows about, each carrying its `selected`
      // state, so the server can entitle checked seats and disable unchecked
      // ones the package would otherwise sell. Entitled-by-default seats are
      // pre-checked. A checked seat the package does not entitle requires a
      // positive rate (except the free seat, which may be entitled at rate 0).
      const seats: SwitchContractBodyInput["seats"] = [];
      for (const { seatType, entitled } of selectedSeats) {
        const entry = values.seats?.[seatType];
        const selected = entry?.selected ?? false;
        const minSeats = Number.isFinite(entry?.minSeats)
          ? (entry?.minSeats ?? 0)
          : 0;
        const rate = Number.isFinite(entry?.rate) ? (entry?.rate ?? 0) : 0;
        const commitmentPrice =
          typeof entry?.commitmentPrice === "number" &&
          Number.isFinite(entry.commitmentPrice) &&
          entry.commitmentPrice > 0
            ? entry.commitmentPrice
            : undefined;
        if (selected && !entitled && seatType !== "free" && !(rate > 0)) {
          setError(
            `Seat "${seatType}" is not entitled by the selected package and ` +
              "requires a rate greater than 0 to entitle it."
          );
          return;
        }
        seats.push({ seatType, selected, minSeats, rate, commitmentPrice });
      }
      if (seats.length > 0) {
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
      selectedTier,
      selectedSeats,
      retroactiveFirstOfMonthISO,
    ]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" label="🔁 Switch contract" />
      </DialogTrigger>
      <DialogContent className="bg-primary-50 dark:bg-primary-50-night sm:h-[90vh] sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle>Switch contract for {owner.name}</DialogTitle>
          <DialogDescription>
            Pick the Metronome package and target plan. Enterprise packages
            require a start time at least one hour in the future; Pro and
            Business packages swap at the current hour.
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
              <DialogContainer className="space-y-4">
                {error && <div className="text-warning">{error}</div>}
                <InputField
                  control={form.control}
                  name="stripeCustomerId"
                  title="Stripe Customer Id (optional for free plans)"
                  placeholder="cus_1234567890"
                />
                {isCurrencyLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner size="sm" />
                    <span>Resolving customer currency...</span>
                  </div>
                )}
                {currencyError && (
                  <div className="text-warning text-sm">
                    Failed to resolve currency from Stripe customer:{" "}
                    {currencyError.message}
                  </div>
                )}
                {trimmedStripeCustomerId && (
                  <SelectField
                    control={form.control}
                    name="stripeCollectionMethod"
                    title="Stripe Collection Method"
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
                )}
                {trimmedStripeCustomerId &&
                  stripeCollectionMethod === "send_invoice" && (
                    <InputField
                      control={form.control}
                      name="netPaymentTermsDays"
                      title="Net Payment Terms (days — e.g. 30 for Net 30)"
                      type="number"
                      placeholder="Leave empty for the Metronome account default"
                    />
                  )}
                {isPackagesLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner size="sm" />
                    <span>Loading Metronome packages...</span>
                  </div>
                )}
                {!isPackagesLoading && packagesError && (
                  <div className="text-warning text-sm">
                    Failed to load Metronome packages: {packagesError.message}
                  </div>
                )}
                {!isPackagesLoading &&
                  !packagesError &&
                  !isCurrencyLoading &&
                  (resolvedCurrency || !trimmedStripeCustomerId) && (
                    <SelectField
                      control={form.control}
                      name="metronomePackageId"
                      title={
                        resolvedCurrency
                          ? `Metronome Package (${resolvedCurrency.toUpperCase()})`
                          : "Metronome Package (free only — no Stripe customer)"
                      }
                      mountPortalContainer={portalContainer}
                      groups={packageGroups}
                    />
                  )}
                {selectedTier === "enterprise" && (
                  <>
                    <SelectField
                      control={form.control}
                      name="planCode"
                      title="Enterprise Plan"
                      mountPortalContainer={portalContainer}
                      options={enterprisePlanOptions}
                    />
                    <SelectField
                      control={form.control}
                      name="startMode"
                      title="Start"
                      mountPortalContainer={portalContainer}
                      options={startModeOptions}
                    />
                    {startMode === "select" && (
                      <InputField
                        control={form.control}
                        name="startingAt"
                        title="Starts At (local time, on the hour — past allowed)"
                        type="datetime-local"
                        step={3600}
                        transformValue={snapDatetimeLocalToHour}
                      />
                    )}
                  </>
                )}
                {(selectedTier === "pro" ||
                  selectedTier === "business" ||
                  selectedTier === "free") && (
                  <div className="text-sm text-muted-foreground">
                    Target plan:{" "}
                    <span className="font-mono">{form.watch("planCode")}</span>{" "}
                    — swap at the current hour, subscription flips
                    synchronously.
                  </div>
                )}
                {paygEligible && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center gap-2">
                      <SliderToggle
                        selected={paygEnabled}
                        onClick={() =>
                          form.setValue("paygEnabled", !paygEnabled)
                        }
                      />
                      <Label className="text-sm">Pay-as-you-go</Label>
                    </div>
                    <InputField
                      control={form.control}
                      name="usageCapCredits"
                      title="Usage Cap (AWU credits, optional)"
                      type="number"
                      placeholder="e.g., 100000 — leave empty for no alert"
                    />
                  </div>
                )}
                {selectedSeats.length > 0 && (
                  <div className="space-y-3 border-t pt-4">
                    <Label className="text-sm">
                      Seats configuration{" "}
                      {resolvedCurrency
                        ? `(rate & price in ${resolvedCurrency.toUpperCase()})`
                        : ""}
                    </Label>
                    <div className="text-xs text-muted-foreground">
                      Checked seats are entitled on the new contract. Seats the
                      package does not entitle by default are unchecked — check
                      one to entitle it (a non-zero rate is required, except for
                      the free seat).
                    </div>
                    {selectedSeats.map(({ seatType, entitled }) => {
                      const isSelected =
                        watchedSeats?.[seatType]?.selected ?? false;
                      return (
                        <div key={seatType} className="flex items-end gap-3">
                          <div className="flex w-32 shrink-0 items-center gap-2 pb-2">
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
                              title="Min seats"
                              type="number"
                              placeholder="0"
                              disabled={!isSelected}
                            />
                          </div>
                          <div className="flex-1">
                            <InputField
                              control={form.control}
                              name={`seats.${seatType}.rate`}
                              title={
                                resolvedCurrency
                                  ? `Seat rate (${resolvedCurrency.toUpperCase()})`
                                  : "Seat rate"
                              }
                              type="number"
                              placeholder="0"
                              disabled={!isSelected}
                            />
                          </div>
                          <div className="flex-1">
                            <InputField
                              control={form.control}
                              name={`seats.${seatType}.commitmentPrice`}
                              title={
                                resolvedCurrency
                                  ? `Commitment price (${resolvedCurrency.toUpperCase()})`
                                  : "Commitment price"
                              }
                              type="number"
                              placeholder="optional"
                              disabled={!isSelected}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {trimmedStripeCustomerId && resolvedCurrency && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center gap-2">
                      <SliderToggle
                        selected={showInitialCredits}
                        onClick={() =>
                          form.setValue(
                            "showInitialCredits",
                            !showInitialCredits
                          )
                        }
                      />
                      <Label className="text-sm">
                        Initial credits (one-off prepaid commit)
                      </Label>
                    </div>
                    {showInitialCredits && (
                      <>
                        <InputField
                          control={form.control}
                          name="initialCreditsAmount"
                          title="Initial Credits (AWU credits)"
                          type="number"
                          placeholder="e.g., 100000"
                        />
                        <InputField
                          control={form.control}
                          name="initialCreditsInvoiceAmount"
                          title={`Amount to Invoice (${resolvedCurrency.toUpperCase()})`}
                          type="number"
                          placeholder="e.g., 5000 — amount billed to the customer"
                        />
                      </>
                    )}
                  </div>
                )}
              </DialogContainer>
              <DialogFooter>
                <Button
                  type="submit"
                  variant="warning"
                  label="Switch"
                  disabled={
                    !selectedTier ||
                    (selectedTier !== "free" && !resolvedCurrency)
                  }
                />
              </DialogFooter>
            </form>
          </PokeForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
