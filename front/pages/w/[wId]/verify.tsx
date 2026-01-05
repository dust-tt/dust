import { Button, DustLogoSquare, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import { PhoneNumberCodeInput } from "@app/components/trial/PhoneNumberCodeInput";
import { PhoneNumberInput } from "@app/components/trial/PhoneNumberInput";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import {
  CODE_LENGTH,
  isValidPhoneNumber,
  maskPhoneNumber,
  RESEND_COOLDOWN_SECONDS,
} from "@app/pages/api/auth/phone_verification";
import { isWorkspaceEligibleForTrial } from "@app/pages/api/auth/trial";
import type { WorkspaceType } from "@app/types";

type Step = "phone" | "code";

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  owner: WorkspaceType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    return { notFound: true };
  }

  const isValidForTrial = await isWorkspaceEligibleForTrial(auth);
  if (!isValidForTrial) {
    return { notFound: true };
  }

  return { props: { owner } };
});

export default function Verify({
  owner: _owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [step, setStep] = useState<Step>("phone");

  const [countryCode, setCountryCode] = useState("+33");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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

  const handleSendCode = async () => {
    setPhoneError(null);

    if (!phoneNumber.trim()) {
      setPhoneError("Please enter your phone number.");
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      setPhoneError(
        "Please enter a valid phone number (digits only, 6-15 digits)."
      );
      return;
    }

    // TODO: Integrate with SMS service.
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setStep("code");
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) {
      return;
    }

    // TODO: Integrate with SMS service.
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setCode(Array(CODE_LENGTH).fill(""));
    inputRefs.current[0]?.focus();
  };

  const handleVerifyCode = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== CODE_LENGTH) {
      setCodeError("Please enter the full 6-digit code.");
      return;
    }

    // TODO: Integrate with verification service.
    // TODO: on success, we call the api to create a sub on the new phone trial plan and redirect to /welcome page.
  };

  const handleCodeChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);

    setCode((prev) => {
      const newCode = [...prev];
      newCode[index] = digit;
      return newCode;
    });
    setCodeError(null);

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
      setCodeError(null);

      const nextIndex = Math.min(digits.length, CODE_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
    },
    []
  );

  const handlePhoneNumberChange = (value: string) => {
    setPhoneNumber(value);
    setPhoneError(null);
  };

  const handleBack = () => {
    setStep("phone");
    setCode(Array(CODE_LENGTH).fill(""));
    setCodeError(null);
  };

  if (step === "code") {
    return (
      <CodeVerificationStep
        maskedPhone={maskPhoneNumber(countryCode, phoneNumber)}
        code={code}
        error={codeError}
        resendCooldown={resendCooldown}
        inputRefs={inputRefs}
        onCodeChange={handleCodeChange}
        onCodeKeyDown={handleCodeKeyDown}
        onCodePaste={handleCodePaste}
        onBack={handleBack}
        onResend={handleResendCode}
        onVerify={handleVerifyCode}
      />
    );
  }

  return (
    <PhoneInputStep
      countryCode={countryCode}
      phoneNumber={phoneNumber}
      error={phoneError}
      onCountryCodeChange={setCountryCode}
      onPhoneNumberChange={handlePhoneNumberChange}
      onSubmit={handleSendCode}
    />
  );
}

interface PhoneInputStepProps {
  countryCode: string;
  phoneNumber: string;
  error: string | null;
  onCountryCodeChange: (code: string) => void;
  onPhoneNumberChange: (phone: string) => void;
  onSubmit: () => void;
}

function PhoneInputStep({
  countryCode,
  phoneNumber,
  error,
  onCountryCodeChange,
  onPhoneNumberChange,
  onSubmit,
}: PhoneInputStepProps) {
  return (
    <ThemeProvider>
      <Page>
        <div className="flex h-full flex-col justify-center">
          <Page.Horizontal>
            <Page.Vertical sizing="grow" gap="lg">
              <Page.Header
                title="Phone number"
                icon={() => <DustLogoSquare className="-ml-11 h-10 w-32" />}
              />
              <p className="-mt-4 text-muted-foreground dark:text-muted-foreground-night">
                To start your free trial, we need to verify your account with an
                SMS code. <br />
                Your number will only be used for this verification.
              </p>

              <div className="flex w-full max-w-xl flex-col gap-4">
                <div className="flex w-full flex-col gap-2">
                  <label className="text-sm font-medium text-foreground dark:text-foreground-night">
                    Phone number
                  </label>
                  <PhoneNumberInput
                    countryCode={countryCode}
                    phoneNumber={phoneNumber}
                    onCountryCodeChange={onCountryCodeChange}
                    onPhoneNumberChange={onPhoneNumberChange}
                  />
                  <p className="min-h-5 text-sm text-red-500">{error}</p>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={onSubmit}
                    variant="primary"
                    label="Send code"
                  />
                </div>
              </div>
            </Page.Vertical>
          </Page.Horizontal>
        </div>
      </Page>
    </ThemeProvider>
  );
}

interface CodeVerificationStepProps {
  maskedPhone: string;
  code: string[];
  error: string | null;
  resendCooldown: number;
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
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
                <Button variant="ghost" label="Back" onClick={onBack} />
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    label={
                      resendCooldown > 0
                        ? `Resend code (${resendCooldown}s)`
                        : "Resend code"
                    }
                    onClick={onResend}
                    disabled={resendCooldown > 0}
                  />
                  <Button
                    variant="primary"
                    label="Verify now"
                    onClick={onVerify}
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
