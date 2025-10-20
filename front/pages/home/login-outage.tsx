import { Button, Input, Label } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useState } from "react";

import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function LoginOutage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      setSuccess(null);
      setError(null);
      try {
        const res = await fetch("/api/auth/outage_login_link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            returnTo:
              typeof router.query.returnTo === "string"
                ? router.query.returnTo
                : "/api/login",
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data?.error?.message || "Failed to send the login email."
          );
        }
        setSuccess(
          "If this email is valid, we just sent you a one-time login link."
        );
      } catch (err: any) {
        setError(err?.message || "Unexpected error. Please try again later.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, router.query.returnTo]
  );

  return (
    <div className="mx-auto mt-8 w-full max-w-xl">
      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
        <div className="text-base font-semibold">Temporary sign-in issue</div>
        <p className="mt-1 text-sm">
          Our login provider is currently experiencing a global outage
          impacting Dust as well as many other applications.
        </p>
        <p className="mt-1 text-sm">
          As a workaround, you can receive a one-time login link by email
          using the form below.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Email address</Label>
          <Input
            type="email"
            name="email"
            id="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-row gap-2">
          <Button
            label={isSubmitting ? "Sending..." : "Send login link"}
            disabled={isSubmitting || email.length === 0}
            type="submit"
          />
        </div>

        {success && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-emerald-800">
            {success}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-rose-800">
            {error}
          </div>
        )}

        <p className="mt-2 text-xs text-slate-500">
          Need help? Contact us at <a href="mailto:support@dust.tt" className="underline">support@dust.tt</a>.
        </p>
      </form>
    </div>
  );
}

LoginOutage.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

