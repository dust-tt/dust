import { PhoneNumberCodeInput } from "@app/components/trial/PhoneNumberCodeInput";
import { PhoneNumberInput } from "@app/components/trial/PhoneNumberInput";
import config from "@app/lib/api/config";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { CP_FREE_PLAN_CREDITS } from "@app/lib/client/subscription";
import { clientFetch } from "@app/lib/egress/client";
import {
  CODE_LENGTH,
  isValidPhoneNumber,
  maskPhoneNumber,
  RESEND_COOLDOWN_SECONDS,
} from "@app/lib/plans/trial/phone";
import { useAppRouter } from "@app/lib/platform";
import { useKillSwitches } from "@app/lib/swr/kill";
import { useAuthContext, useVerifyData } from "@app/lib/swr/workspaces";
import {
  ActionSparklesIcon,
  Button,
  DustLogoSquare,
  Icon,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { Turnstile } from "@marsidev/react-turnstile";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Country } from "react-phone-number-input";

type Step = "captcha" | "phone" | "code" | "done";

export function VerifyPage() {
  const { workspace } = useAuth();
  const router = useAppRouter();
  const { hasFeature } = useFeatureFlags();
  const { killSwitches } = useKillSwitches();
  const { mutateAuthContext } = useAuthContext({
    workspaceId: workspace.sId,
  });

  // Same gate as the one that routes to /select-subscription (see
  // `isMetronomeCheckoutEnabled` and SubscribePage): the credit-priced checkout
  // flow gets the new phone verification copy and a welcome screen at the end.
  const isMetronomeEnabled =
    hasFeature("metronome_billing") ||
    !killSwitches?.includes("global_disable_metronome_billing");
  const isMetronomeCheckout =
    isMetronomeEnabled && hasFeature("metronome_cp_checkout");

  const {
    verifyData,
    isEligibleForTrial,
    initialCountryCode,
    isVerifyDataLoading,
  } = useVerifyData({ workspaceId: workspace.sId });

  const [step, setStep] = useState<Step>("captcha");
  const [isLoading, setIsLoading] = useState(false);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const [phoneNumber, setPhoneNumber] = useState("");
  const [countryCode, setCountryCode] = useState<Country>("US");
  const [countryInitialized, setCountryInitialized] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize countryCode once data is loaded.
  useEffect(() => {
    if (verifyData && !countryInitialized) {
      setCountryCode(initialCountryCode);
      setCountryInitialized(true);
    }
  }, [verifyData, countryInitialized, initialCountryCode]);

  useEffect(() => {
    // Note: This is a temporary solution, needs to be replaced when we properly validate the phone.
    if (resendCooldown <= 0) {
      return;
    }
    const timerMs = 1000;
    const timer = setTimeout(
      () => setResendCooldown((prev) => prev - 1),
      timerMs
    );
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (step === "code") {
      inputRefs.current[0]?.focus();
    }
  }, [step]);

  const goToWorkspace = useCallback(() => {
    void router.push(`/w/${workspace.sId}/conversation/new?welcome=true`);
  }, [router, workspace.sId]);

  const handleSendCode = async () => {
    setPhoneError(null);

    if (!phoneNumber.trim()) {
      setPhoneError("Please enter your phone number.");
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      setPhoneError("Please enter a valid phone number.");
      return;
    }

    if (!captchaToken) {
      setCaptchaKey((k) => k + 1);
      setCaptchaToken(null);
      setStep("captcha");
      return;
    }

    setIsLoading(true);
    const e164Phone = phoneNumber;
    let response: Response;
    try {
      response = await clientFetch(
        `/api/w/${workspace.sId}/verification/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: e164Phone, captchaToken }),
        }
      );
    } catch {
      setPhoneError("Unexpected error. Please try again.");
      return;
    } finally {
      setIsLoading(false);
    }

    if (!response.ok) {
      const data = await response.json();
      if (data.error?.type === "invalid_captcha") {
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
        setStep("captcha");
        setPhoneError(
          data.error?.message ??
            "Captcha verification failed. Please try again."
        );
        return;
      }
      if (data.error?.type === "rate_limit_error" && data.error?.retryAfter) {
        const waitSeconds = Math.max(
          0,
          data.error.retryAfter - Math.floor(Date.now() / 1000)
        );
        setResendCooldown(waitSeconds);
        const waitMinutes = Math.ceil(waitSeconds / 60);
        setPhoneError(
          `Too many verification attempts. Please try again in ${waitMinutes} minute${waitMinutes > 1 ? "s" : ""}.`
        );
        return;
      }
      setPhoneError(data.error?.message ?? "Failed to send code");
      return;
    }

    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setStep("code");
  };

  const handleVerifyCode = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== CODE_LENGTH) {
      setPhoneError("Please enter the full 6-digit code.");
      return;
    }

    setIsLoading(true);
    setPhoneError(null);
    try {
      const e164Phone = phoneNumber;

      const verifyResponse = await clientFetch(
        `/api/w/${workspace.sId}/verification/validate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: e164Phone, code: fullCode }),
        }
      );

      if (!verifyResponse.ok) {
        const data = await verifyResponse.json();
        setPhoneError(data.error?.message ?? "Invalid code");
        return;
      }

      const trialResponse = await clientFetch(
        `/api/w/${workspace.sId}/trial/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!trialResponse.ok) {
        const data = await trialResponse.json();
        setPhoneError(data.api_error?.message ?? "Failed to start trial");
        return;
      }

      // Revalidate the auth context so the SPA picks up the new subscription
      // (canUseProduct is now true) and doesn't redirect back to /trial.
      await mutateAuthContext();

      // With the credit-priced checkout flow we show a welcome screen before
      // entering the workspace instead of redirecting there directly.
      if (isMetronomeCheckout) {
        setStep("done");
      } else {
        goToWorkspace();
      }
    } catch {
      setPhoneError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);

    setCode((prev) => {
      const newCode = [...prev];
      newCode[index] = digit;
      return newCode;
    });
    setPhoneError(null);

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleCodeKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !code[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [code]
  );

  const handleCodePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const digits = e.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, CODE_LENGTH)
        .split("");

      setCode((prev) => {
        const newCode = [...prev];
        digits.forEach((digit, i) => {
          newCode[i] = digit;
        });
        return newCode;
      });
      setPhoneError(null);

      const nextIndex = Math.min(digits.length, CODE_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
    },
    []
  );

  const handlePhoneNumberChange = (value: string) => {
    setPhoneNumber(value);
    setPhoneError(null);
  };

  const handleCountryCodeChange = (value?: Country) => {
    if (value) {
      setCountryCode(value);
    }
  };

  const handleBack = () => {
    setStep("phone");
    setCode(Array(CODE_LENGTH).fill(""));
    setPhoneError(null);
  };

  // Show loading while fetching verify data.
  if (isVerifyDataLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Redirect to subscribe if not eligible for trial.
  if (!isEligibleForTrial) {
    void router.replace(`/w/${workspace.sId}/subscribe`);
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (step === "done") {
    return (
      <WelcomeStep
        credits={CP_FREE_PLAN_CREDITS}
        onStartBuilding={goToWorkspace}
      />
    );
  }

  if (step === "captcha") {
    return (
      <CaptchaStep
        captchaKey={captchaKey}
        siteKey={config.getTurnstileSiteKey()}
        error={phoneError}
        onSuccess={(token) => {
          setCaptchaToken(token);
          setPhoneError(null);
          setStep("phone");
        }}
        onExpire={() => {
          setCaptchaToken(null);
        }}
        onError={() => {
          setCaptchaToken(null);
          setPhoneError(
            "Captcha could not load. Please refresh and try again."
          );
        }}
      />
    );
  }

  if (step === "code") {
    return (
      <CodeVerificationStep
        maskedPhone={maskPhoneNumber(phoneNumber)}
        code={code}
        error={phoneError}
        resendCooldown={resendCooldown}
        inputRefs={inputRefs}
        isLoading={isLoading}
        onCodeChange={handleCodeChange}
        onCodeKeyDown={handleCodeKeyDown}
        onCodePaste={handleCodePaste}
        onBack={handleBack}
        onResend={handleSendCode}
        onVerify={handleVerifyCode}
      />
    );
  }

  return (
    <PhoneInputStep
      isMetronome={isMetronomeCheckout}
      phoneNumber={phoneNumber}
      countryCode={countryCode}
      error={phoneError}
      isLoading={isLoading}
      onPhoneNumberChange={handlePhoneNumberChange}
      onCountryCodeChange={handleCountryCodeChange}
      onSubmit={handleSendCode}
    />
  );
}

interface PhoneInputStepProps {
  isMetronome: boolean;
  phoneNumber: string;
  countryCode: Country;
  error: string | null;
  isLoading: boolean;
  onCountryCodeChange: (code?: Country) => void;
  onPhoneNumberChange: (phone: string) => void;
  onSubmit: () => void;
}

function PhoneInputStep({
  isMetronome,
  phoneNumber,
  countryCode,
  error,
  isLoading,
  onPhoneNumberChange,
  onCountryCodeChange,
  onSubmit,
}: PhoneInputStepProps) {
  return (
    <Page>
      <div className="flex h-full flex-col justify-center">
        <Page.Horizontal>
          <Page.Vertical sizing="grow" gap="lg">
            {isMetronome ? (
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground dark:text-foreground-night">
                  Verify your phone
                </h1>
                <p className="text-muted-foreground dark:text-muted-foreground-night">
                  We verify your number once to keep free credits fair. We won't
                  text you otherwise.
                </p>
              </div>
            ) : (
              <>
                <Page.Header
                  title="Phone number"
                  icon={() => <DustLogoSquare className="-ml-11 h-10 w-32" />}
                />
                <p className="-mt-4 text-muted-foreground dark:text-muted-foreground-night">
                  To start your free trial, we need to verify your account with
                  an SMS code. <br />
                  Your number will only be used for this verification.
                </p>
              </>
            )}

            <div className="flex w-full max-w-xl flex-col gap-4">
              <div className="flex w-full flex-col gap-2">
                <PhoneNumberInput
                  phoneNumber={phoneNumber}
                  countryCode={countryCode}
                  onPhoneNumberChange={onPhoneNumberChange}
                  onCountryCodeChange={onCountryCodeChange}
                />
                <p className="min-h-5 text-sm text-red-500">{error}</p>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={onSubmit}
                  variant="primary"
                  label={isLoading ? "Sending..." : "Send code"}
                  disabled={isLoading}
                />
              </div>
            </div>
          </Page.Vertical>
        </Page.Horizontal>
      </div>
    </Page>
  );
}

interface CodeVerificationStepProps {
  maskedPhone: string;
  code: string[];
  error: string | null;
  resendCooldown: number;
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  isLoading: boolean;
  onCodeChange: (index: number, value: string) => void;
  onCodeKeyDown: (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => void;
  onCodePaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  onBack: () => void;
  onResend: () => void;
  onVerify: () => void;
}

function CodeVerificationStep({
  maskedPhone,
  code,
  error,
  resendCooldown,
  inputRefs,
  isLoading,
  onCodeChange,
  onCodeKeyDown,
  onCodePaste,
  onBack,
  onResend,
  onVerify,
}: CodeVerificationStepProps) {
  return (
    <Page>
      <div className="flex h-full flex-col justify-center">
        <Page.Horizontal>
          <Page.Vertical sizing="grow" gap="lg">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold text-foreground dark:text-foreground-night">
                Enter verification code
              </h1>
              <p className="text-muted-foreground dark:text-muted-foreground-night">
                A verification code has been sent to{" "}
                <span className="font-medium text-foreground dark:text-foreground-night">
                  {maskedPhone}
                </span>
              </p>
            </div>

            <div className="flex w-fit flex-col gap-6">
              <div className="flex flex-col gap-4">
                <PhoneNumberCodeInput
                  code={code}
                  onChange={onCodeChange}
                  onKeyDown={onCodeKeyDown}
                  onPaste={onCodePaste}
                  inputRefs={inputRefs}
                />
                <p className="min-h-5 text-sm text-red-500">{error}</p>
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  label="Back"
                  onClick={onBack}
                  disabled={isLoading}
                />
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    label={
                      resendCooldown > 0
                        ? `Resend code (${resendCooldown}s)`
                        : "Resend code"
                    }
                    onClick={onResend}
                    disabled={resendCooldown > 0 || isLoading}
                  />
                  <Button
                    variant="primary"
                    label={isLoading ? "Verifying..." : "Verify now"}
                    onClick={onVerify}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>
          </Page.Vertical>
        </Page.Horizontal>
      </div>
    </Page>
  );
}

interface CaptchaStepProps {
  captchaKey: number;
  siteKey: string;
  error: string | null;
  onSuccess: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
}

function CaptchaStep({
  captchaKey,
  siteKey,
  error,
  onSuccess,
  onExpire,
  onError,
}: CaptchaStepProps) {
  return (
    <Page>
      <div className="flex h-full flex-col justify-center">
        <Page.Horizontal>
          <Page.Vertical sizing="grow" gap="lg">
            <Page.Header
              title="Verify you're human"
              icon={() => <DustLogoSquare className="-ml-11 h-10 w-32" />}
            />
            <p className="-mt-4 text-muted-foreground dark:text-muted-foreground-night">
              A quick check before we send your verification code.
            </p>

            <div className="flex w-full max-w-xl flex-col gap-4">
              <Turnstile
                key={captchaKey}
                siteKey={siteKey}
                onSuccess={onSuccess}
                onExpire={onExpire}
                onError={onError}
                options={{ theme: "auto" }}
              />
              <p className="min-h-5 text-sm text-red-500">{error}</p>
            </div>
          </Page.Vertical>
        </Page.Horizontal>
      </div>
    </Page>
  );
}

interface WelcomeStepProps {
  credits: number;
  onStartBuilding: () => void;
}

function WelcomeStep({ credits, onStartBuilding }: WelcomeStepProps) {
  return (
    <Page>
      <div className="flex h-full flex-col items-center justify-center">
        <div className="flex max-w-xl flex-col items-center gap-6 text-center">
          <Icon
            visual={ActionSparklesIcon}
            size="lg"
            className="text-highlight-500"
          />
          <h1 className="text-4xl font-bold text-foreground dark:text-foreground-night">
            You're in. Welcome to Dust.
          </h1>
          <p className="text-lg text-muted-foreground dark:text-muted-foreground-night">
            You've got{" "}
            <span className="font-bold text-foreground dark:text-foreground-night">
              {credits.toLocaleString()} credits
            </span>{" "}
            to explore, they never expire, so take your time. Let's put them to
            work.
          </p>
          <Button
            variant="highlight"
            size="md"
            label="Start building"
            onClick={onStartBuilding}
          />
        </div>
      </div>
    </Page>
  );
}
