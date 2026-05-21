import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import {
  InputField,
  SelectField,
} from "@app/components/poke/shadcn/ui/form/fields";
import { clientFetch } from "@app/lib/egress/client";
import { isPaygEligibleTier } from "@app/lib/metronome/types";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
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
import type { ProgrammaticUsageConfigurationType } from "@app/types/programmatic_usage";
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
import assert from "assert";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const MICRO_USD_PER_DOLLAR = 1_000_000;
const MAX_PAYG_CAP_DOLLARS = 20_000;

const SwitchContractFormSchema = z
  .object({
    metronomePackageId: z.string().min(1, "Required"),
    planCode: z.string().min(1, "Required"),
    startingAt: z.string().optional(),
    stripeCustomerId: z.string().min(1, "Required"),
    paygEnabled: z.boolean().default(false),
    paygCapDollars: z
      .number()
      .min(1, "PAYG cap must be at least $1")
      .max(
        MAX_PAYG_CAP_DOLLARS,
        `PAYG cap cannot exceed $${MAX_PAYG_CAP_DOLLARS.toLocaleString()}`
      )
      .optional(),
  })
  .refine((data) => !data.paygEnabled || data.paygCapDollars !== undefined, {
    message: "PAYG cap is required when Pay-as-you-go is enabled.",
    path: ["paygCapDollars"],
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
  programmaticUsageConfig: ProgrammaticUsageConfigurationType | null;
  stripeCustomerId: string | null;
}

export default function SwitchContractDialog({
  owner,
  programmaticUsageConfig,
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

  const initialPaygCapMicroUsd =
    programmaticUsageConfig?.paygCapMicroUsd ?? null;
  const form = useForm<SwitchContractFormValues>({
    resolver: zodResolver(SwitchContractFormSchema),
    defaultValues: {
      metronomePackageId: "",
      planCode: "",
      startingAt: "",
      stripeCustomerId: stripeCustomerId ?? "",
      paygEnabled: initialPaygCapMicroUsd !== null,
      paygCapDollars:
        initialPaygCapMicroUsd !== null
          ? initialPaygCapMicroUsd / MICRO_USD_PER_DOLLAR
          : undefined,
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
  const packageGroups = useMemo(() => {
    const inCurrency = metronomePackages.filter(
      (p) => p.currency === resolvedCurrency
    );
    const toOption = (p: (typeof inCurrency)[number]) => ({
      value: p.id,
      display: `${p.name} (${p.tier}, ${p.currency.toUpperCase()})`,
    });
    return [
      {
        label: "Current",
        options: inCurrency
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
    } else if (selectedTier === "business") {
      if (isLegacyPackageName(selectedName ?? "")) {
        form.setValue("planCode", PRO_PLAN_SEAT_39_CODE);
      } else {
        form.setValue("planCode", CREDIT_PRICED_BUSINESS_PLAN_CODE);
      }
      form.setValue("startingAt", "");
    } else if (selectedTier === "enterprise") {
      form.setValue("planCode", "");
      form.setValue("startingAt", minStartingAtLocal);
    }
    if (selectedTier && !isPaygEligibleTier(selectedTier)) {
      form.setValue("paygEnabled", false);
      form.setValue("paygCapDollars", undefined);
    }
  }, [selectedTier, selectedName, form, minStartingAtLocal]);

  const enterprisePlanOptions = useMemo(
    () =>
      plans
        .filter((plan) => isEntreprisePlanPrefix(plan.code))
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
      const cleaned: Record<string, unknown> = {
        metronomePackageId: values.metronomePackageId.trim(),
        planCode: values.planCode.trim(),
        stripeCustomerId: values.stripeCustomerId.trim(),
        paygEnabled: values.paygEnabled,
      };
      if (values.paygEnabled && values.paygCapDollars !== undefined) {
        cleaned.paygCapDollars = values.paygCapDollars;
      }
      if (selectedTier === "enterprise" && values.startingAt) {
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
                  title="Stripe Customer Id"
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
                  resolvedCurrency &&
                  !isCurrencyLoading && (
                    <SelectField
                      control={form.control}
                      name="metronomePackageId"
                      title={`Metronome Package (${resolvedCurrency.toUpperCase()})`}
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
                    <InputField
                      control={form.control}
                      name="startingAt"
                      title="Starts At (local time, ≥ 1h from now, on the hour)"
                      type="datetime-local"
                      min={minStartingAtLocal}
                      step={3600}
                      transformValue={snapDatetimeLocalToHour}
                    />
                  </>
                )}
                {(selectedTier === "pro" || selectedTier === "business") && (
                  <div className="text-sm text-muted-foreground">
                    Target plan:{" "}
                    <span className="font-mono">{form.watch("planCode")}</span>{" "}
                    — swap at the current hour, subscription flips
                    synchronously.
                  </div>
                )}
                {paygEligible && (
                  <div className="border-t pt-4">
                    <div className="mb-4 flex items-center gap-2">
                      <SliderToggle
                        selected={paygEnabled}
                        onClick={() =>
                          form.setValue("paygEnabled", !paygEnabled)
                        }
                      />
                      <Label className="text-sm">Pay-as-you-go</Label>
                    </div>
                    {paygEnabled && (
                      <div className="ml-6">
                        <InputField
                          control={form.control}
                          name="paygCapDollars"
                          title="PAYG Spending Cap (USD)"
                          type="number"
                          placeholder="e.g., 1000"
                        />
                      </div>
                    )}
                  </div>
                )}
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
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
