import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { CreatePokeCouponResponseBody } from "@app/pages/api/poke/coupons/index";
import type { CouponDiscountType } from "@app/types/coupon";
import { CreateCouponBodySchema } from "@app/types/coupon";
import { isString } from "@app/types/shared/utils/general";
import {
  Button,
  Input,
  RadioGroup,
  RadioGroupItem,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type React from "react";
import { useState } from "react";

interface FormState {
  code: string;
  description: string;
  discountType: CouponDiscountType;
  amountStr: string;
  durationMonths: string;
  maxRedemptions: string;
  expirationDate: string;
}

const FORM_STATE_KEYS: ReadonlyArray<keyof FormState> = [
  "code",
  "description",
  "discountType",
  "amountStr",
  "durationMonths",
  "maxRedemptions",
  "expirationDate",
];

function isFormStateKey(key: string): key is keyof FormState {
  return (FORM_STATE_KEYS as readonly string[]).includes(key);
}

const EMPTY_FORM: FormState = {
  code: "",
  description: "",
  discountType: "seat",
  amountStr: "",
  durationMonths: "",
  maxRedemptions: "",
  expirationDate: "",
};

interface CreateCouponFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

export function CreateCouponForm({
  onCreated,
  onCancel,
}: CreateCouponFormProps) {
  const sendNotification = useSendNotification();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const body = {
      code: form.code.trim(),
      description: form.description.trim() || null,
      discountType: form.discountType,
      amount: form.amountStr ? parseFloat(form.amountStr) : 0,
      durationMonths: form.durationMonths
        ? parseInt(form.durationMonths, 10)
        : null,
      maxRedemptions: form.maxRedemptions
        ? parseInt(form.maxRedemptions, 10)
        : null,
      expirationDate: form.expirationDate || null,
    };

    const result = CreateCouponBodySchema.safeParse(body);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormState, string>> = {};
      for (const issue of result.error.issues) {
        const pathElement = issue.path[0];
        if (!isString(pathElement)) {
          continue;
        }
        const field = pathElement === "amount" ? "amountStr" : pathElement;
        if (isFormStateKey(field)) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const r = await clientFetch("/api/poke/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      if (!r.ok) {
        const text = await r.text();
        if (r.status === 400 && text.includes("already exists")) {
          setErrors({ code: "A coupon with this code already exists." });
        } else {
          sendNotification({
            title: "Error creating coupon",
            type: "error",
            description: `Something went wrong: ${r.status} ${text}`,
          });
        }
        return;
      }

      const data = (await r.json()) as CreatePokeCouponResponseBody;
      sendNotification({
        title: "Coupon created",
        type: "success",
        description: `Coupon "${data.coupon.code}" created successfully.`,
      });
      setForm(EMPTY_FORM);
      onCreated();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border bg-muted/40 p-6 dark:bg-muted-night/40">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Create coupon</h2>
        <Button icon={XMarkIcon} variant="ghost" size="sm" onClick={onCancel} />
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">
            Code <span className="text-red-500">*</span>
          </label>
          <Input
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="PROMO2025"
          />
          {errors.code && (
            <span className="text-xs text-red-500">{errors.code}</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Description</label>
          <Input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Optional description"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">
            Discount type <span className="text-red-500">*</span>
          </label>
          <RadioGroup
            name="discountType"
            value={form.discountType}
            onValueChange={(value) =>
              set("discountType", value as CouponDiscountType)
            }
          >
            <RadioGroupItem value="seat" label="Seat" />
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">
            Amount <span className="text-red-500">*</span>
          </label>
          <Input
            type="number"
            value={form.amountStr}
            onChange={(e) => set("amountStr", e.target.value)}
            placeholder="e.g. 50"
            min={0.5}
            step={0.5}
          />
          {errors.amountStr && (
            <span className="text-xs text-red-500">{errors.amountStr}</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Duration (months)</label>
          <Input
            type="number"
            value={form.durationMonths}
            onChange={(e) => set("durationMonths", e.target.value)}
            placeholder="Leave blank for once"
            min={1}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Max redemptions</label>
          <Input
            type="number"
            value={form.maxRedemptions}
            onChange={(e) => set("maxRedemptions", e.target.value)}
            placeholder="Leave blank for unlimited"
            min={1}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Expiration date</label>
          <Input
            type="date"
            value={form.expirationDate}
            onChange={(e) => set("expirationDate", e.target.value)}
          />
        </div>

        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button
            label="Cancel"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          />
          <Button
            label={isSubmitting ? "Creating…" : "Create coupon"}
            variant="primary"
            type="submit"
            disabled={isSubmitting}
          />
        </div>
      </form>
    </div>
  );
}
