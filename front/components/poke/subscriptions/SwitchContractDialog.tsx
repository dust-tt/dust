import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import {
  InputField,
  SelectField,
} from "@app/components/poke/shadcn/ui/form/fields";
import { clientFetch } from "@app/lib/egress/client";
import { isPaygEligibleTier } from "@app/lib/metronome/types";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  CREDIT_PRICED_FREE_PLAN_CODE,
  isEntreprisePlanPrefix,
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
  startImmediately: z.boolean().default(false),
  stripeCustomerId: z.string(),
  stripeCollectionMethod: z
    .enum(["charge_automatically", "send_invoice"])
    .default("charge_automatically"),
  paygEnabled: z.boolean().default(false),
  usageCapCredits: z
    .number()
    .int("Usage cap must be an integer number of credits")
    .min(1, "Usage cap must be at least 1 credit")
    .optional(),
});
type SwitchContractFormValues = z.infer<typeof SwitchContractFormSchema>;

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

  // Min datetime for enterprise startingAt — ≥1h future, snapped to the next
  // local hour boundary.
  const minStartingAtLocal = useMemo(() => {
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
      startImmediately: false,
      stripeCustomerId: stripeCustomerId ?? "",
      stripeCollectionMethod: "charge_automatically",
      paygEnabled: false,
      usageCapCredits: undefined,
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
      form.setValue("startImmediately", false);
    } else if (selectedTier === "business") {
      if (isLegacyPackageName(selectedName ?? "")) {
        form.setValue("planCode", PRO_PLAN_SEAT_39_CODE);
      } else {
        form.setValue("planCode", CREDIT_PRICED_BUSINESS_PLAN_CODE);
      }
      form.setValue("startingAt", "");
      form.setValue("startImmediately", false);
    } else if (selectedTier === "enterprise") {
      form.setValue("planCode", "");
      form.setValue("startingAt", minStartingAtLocal);
      form.setValue("startImmediately", false);
    } else if (selectedTier === "free") {
      form.setValue("planCode", CREDIT_PRICED_FREE_PLAN_CODE);
      form.setValue("startingAt", "");
      form.setValue("startImmediately", false);
    }
    if (selectedTier && !isPaygEligibleTier(selectedTier)) {
      form.setValue("paygEnabled", false);
      form.setValue("usageCapCredits", undefined);
    }
  }, [selectedTier, selectedName, form, minStartingAtLocal]);

  const startImmediately = form.watch("startImmediately");

  const enterprisePlanOptions = useMemo(
    () =>
      plans
        .filter(
          (plan) =>
            isEntreprisePlanPrefix(plan.code) && isCreditPricedPlan(plan)
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

  const onSubmit = useCallback(
    (values: SwitchContractFormValues) => {
      const trimmedStripe = values.stripeCustomerId.trim();
      const cleaned: Record<string, unknown> = {
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
      if (values.usageCapCredits !== undefined) {
        cleaned.usageCapCredits = values.usageCapCredits;
      }
      if (
        selectedTier === "enterprise" &&
        !values.startImmediately &&
        values.startingAt
      ) {
        // datetime-local strings have no timezone — convert to ISO so the
        // server's Date.parse is unambiguous.
        cleaned.startingAt = new Date(values.startingAt).toISOString();
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
    [form, owner.sId, router, selectedTier]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" label="🔁 Switch contract" />
      </DialogTrigger>
      <DialogContent className="bg-primary-50 dark:bg-primary-50-night sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Switch contract for {owner.name}</DialogTitle>
          <DialogDescription>
            Pick the Metronome package and target plan. Enterprise packages
            require a start time at least one hour in the future; Pro and
            Business packages swap at the current hour.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {error && <div className="text-warning">{error}</div>}
          {isSubmitting && (
            <div className="flex justify-center">
              <Spinner size="lg" />
            </div>
          )}
          {!isSubmitting && (
            <PokeForm {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <InputField
                  control={form.control}
                  name="stripeCustomerId"
                  title="Stripe Customer Id (optional for free plans)"
                  placeholder="cus_1234567890"
                  readOnly={stripeCustomerId !== null}
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
                    <div className="flex items-center gap-2">
                      <SliderToggle
                        selected={startImmediately}
                        onClick={() =>
                          form.setValue("startImmediately", !startImmediately)
                        }
                      />
                      <Label className="text-sm">
                        Start immediately (swap at current hour, bypass the 1h
                        delay)
                      </Label>
                    </div>
                    {!startImmediately && (
                      <InputField
                        control={form.control}
                        name="startingAt"
                        title="Starts At (local time, ≥ 1h from now, on the hour)"
                        type="datetime-local"
                        min={minStartingAtLocal}
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
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
