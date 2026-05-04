import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import {
  InputField,
  SelectField,
} from "@app/components/poke/shadcn/ui/form/fields";
import { clientFetch } from "@app/lib/egress/client";
import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import { usePokeMetronomePackages, usePokePlans } from "@app/lib/swr/poke";
import type {
  EnterpriseUpgradeFormType,
  SubscriptionType,
} from "@app/types/plan";
import {
  EnterpriseUpgradeFormSchema,
  isSubscriptionMetronomeBilled,
} from "@app/types/plan";
import type { ProgrammaticUsageConfigurationType } from "@app/types/programmatic_usage";
import { removeNulls } from "@app/types/shared/utils/general";
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
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

const MICRO_USD_PER_DOLLAR = 1_000_000;

function snapDatetimeLocalToHour(value: string): string {
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) &&
    value.slice(14, 16) !== "00"
  ) {
    return value.slice(0, 14) + "00";
  }

  return value;
}

interface EnterpriseUpgradeDialogProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  programmaticUsageConfig: ProgrammaticUsageConfigurationType | null;
}

export default function EnterpriseUpgradeDialog({
  owner,
  subscription,
  programmaticUsageConfig,
}: EnterpriseUpgradeDialogProps) {
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

  const isMetronomeBilled = isSubscriptionMetronomeBilled(subscription);
  const { plans } = usePokePlans();
  const {
    packages: metronomePackages,
    isPackagesLoading,
    packagesError,
  } = usePokeMetronomePackages({
    disabled: !isMetronomeBilled || !open,
  });
  const router = useAppRouter();

  // Min datetime for the startingAt picker — at least one hour in the future
  // and rounded up to the next local hour boundary, since Metronome contracts
  // must start on the hour and the picker is restricted to whole hours.
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

  const enterprisePackageOptions = useMemo(
    () =>
      metronomePackages
        .filter((p) => p.name.toLowerCase().includes("enterprise"))
        .map((p) => ({ value: p.id, display: p.name })),
    [metronomePackages]
  );
  const isEnterprisePackageSelectionDisabled =
    isMetronomeBilled &&
    (isPackagesLoading ||
      !!packagesError ||
      enterprisePackageOptions.length === 0);

  const freeCreditMicroUsd =
    programmaticUsageConfig?.freeCreditMicroUsd ?? null;
  const paygCapMicroUsd = programmaticUsageConfig?.paygCapMicroUsd ?? null;

  const form = useForm<EnterpriseUpgradeFormType>({
    resolver: ioTsResolver(EnterpriseUpgradeFormSchema),
    defaultValues: {
      stripeSubscriptionId: !isMetronomeBilled
        ? (subscription.stripeSubscriptionId ?? "")
        : undefined,
      metronomePackageId: isMetronomeBilled ? "" : undefined,
      startingAt: isMetronomeBilled ? minStartingAtLocal : undefined,
      planCode: "",
      freeCreditsOverrideEnabled: freeCreditMicroUsd !== null,
      freeCreditsDollars:
        freeCreditMicroUsd !== null
          ? freeCreditMicroUsd / MICRO_USD_PER_DOLLAR
          : undefined,
      defaultDiscountPercent:
        programmaticUsageConfig?.defaultDiscountPercent ?? 0,
      paygEnabled: paygCapMicroUsd !== null,
      paygCapDollars:
        paygCapMicroUsd !== null
          ? paygCapMicroUsd / MICRO_USD_PER_DOLLAR
          : undefined,
    },
  });

  const freeCreditsOverrideEnabled = form.watch("freeCreditsOverrideEnabled");
  const paygEnabled = form.watch("paygEnabled");

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const onSubmit = useCallback(
    (values: EnterpriseUpgradeFormType) => {
      const cleanedValues = Object.fromEntries(
        removeNulls(
          Object.entries(values).map(([key, value]) => {
            if (typeof value !== "string") {
              return [key, value];
            }
            const cleanedValue = value.trim();
            if (!cleanedValue) {
              return null;
            }
            return [key, cleanedValue];
          })
        )
      );

      // datetime-local inputs return a local-time string with no timezone.
      // Convert to ISO so the server's Date.parse is unambiguous.
      if (typeof cleanedValues.startingAt === "string") {
        cleanedValues.startingAt = new Date(
          cleanedValues.startingAt
        ).toISOString();
      }

      const submit = async () => {
        setIsSubmitting(true);
        setError(null);
        try {
          const r = await clientFetch(
            `/api/poke/workspaces/${owner.sId}/upgrade_enterprise`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(cleanedValues),
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
    [form, owner.sId, router, setError, setIsSubmitting, setOpen]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" label="🏢 Upgrade to Enterprise" />
      </DialogTrigger>
      <DialogContent className="bg-primary-50 dark:bg-primary-50-night sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upgrade {owner.name} to Enterprise.</DialogTitle>
          <DialogDescription>
            Select the enterprise plan and provide the{" "}
            {isMetronomeBilled
              ? "Metronome package and contract start time"
              : "Stripe subscription Id"}{" "}
            of the customer.
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
                className="space-y-8"
              >
                <div className="grid gap-4 py-4">
                  <div className="grid-cols grid items-center gap-4">
                    <SelectField
                      control={form.control}
                      name="planCode"
                      title="Enterprise Plan"
                      mountPortalContainer={portalContainer}
                      options={plans
                        .filter((plan) => isEntreprisePlanPrefix(plan.code))
                        .map((plan) => ({
                          value: plan.code,
                          display: `${plan.name} (${plan.code})`,
                        }))}
                    />
                  </div>
                  {isMetronomeBilled ? (
                    <>
                      {isPackagesLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Spinner size="sm" />
                          <span>Loading Metronome packages...</span>
                        </div>
                      )}
                      {!isPackagesLoading && packagesError && (
                        <div className="text-warning text-sm">
                          Failed to load Metronome packages:{" "}
                          {packagesError.message}
                        </div>
                      )}
                      {!isPackagesLoading &&
                        !packagesError &&
                        enterprisePackageOptions.length === 0 && (
                          <div className="text-warning text-sm">
                            No enterprise Metronome package is available.
                          </div>
                        )}
                      {!isPackagesLoading && !packagesError && (
                        <div className="grid-cols grid items-center gap-4">
                          <SelectField
                            control={form.control}
                            name="metronomePackageId"
                            title="Metronome Enterprise Package"
                            mountPortalContainer={portalContainer}
                            options={enterprisePackageOptions}
                          />
                        </div>
                      )}
                      <div className="grid-cols grid items-center gap-4">
                        <InputField
                          control={form.control}
                          name="startingAt"
                          title="Starts At (local time, ≥ 1h from now, on the hour)"
                          type="datetime-local"
                          min={minStartingAtLocal}
                          step={3600}
                          transformValue={snapDatetimeLocalToHour}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="grid-cols grid items-center gap-4">
                      <InputField
                        control={form.control}
                        name="stripeSubscriptionId"
                        title="Stripe Subscription id"
                        placeholder="sub_1234567890"
                      />
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <h4 className="mb-4 font-medium">
                      Programmatic Usage Configuration
                    </h4>

                    <div className="mb-4 flex items-center gap-2">
                      <SliderToggle
                        selected={freeCreditsOverrideEnabled}
                        onClick={() =>
                          form.setValue(
                            "freeCreditsOverrideEnabled",
                            !freeCreditsOverrideEnabled
                          )
                        }
                      />
                      <Label className="text-sm">Negotiated Free Credits</Label>
                    </div>
                    {freeCreditsOverrideEnabled && (
                      <div className="mb-4 ml-6">
                        <InputField
                          control={form.control}
                          name="freeCreditsDollars"
                          title="Free Credits (USD)"
                          type="number"
                          placeholder="e.g., 100"
                        />
                      </div>
                    )}

                    <div className="mb-4">
                      <InputField
                        control={form.control}
                        name="defaultDiscountPercent"
                        title="Default Discount (%)"
                        type="number"
                        placeholder="0"
                      />
                    </div>

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
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    variant="warning"
                    label="Upgrade"
                    disabled={isEnterprisePackageSelectionDisabled}
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
