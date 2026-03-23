import { PublicWebsiteLogo } from "@app/components/home/LandingLayout";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import config from "@app/lib/api/config";
import { useSendOtpVerification, useVerifyOtpCode } from "@app/lib/swr/share";
import { Button, Input, Label } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

interface VerificationLayoutProps {
  children: ReactNode;
  description: ReactNode;
  title: string;
}

function VerificationLayout({
  children,
  description,
  title,
}: VerificationLayoutProps) {
  const staticWebsiteUrl = config.getStaticWebsiteUrl();

  return (
    <div className="flex h-dvh w-full flex-col">
      <AppLayoutTitle className="h-12 bg-gray-50 px-4 dark:bg-gray-900">
        <div className="flex h-full items-center">
          <PublicWebsiteLogo size="small" baseUrl={staticWebsiteUrl} />
        </div>
      </AppLayoutTitle>
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="flex w-full max-w-md flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-foreground dark:text-foreground-night">
              {title}
            </h1>
            <p className="text-muted-foreground dark:text-muted-foreground-night text-sm">
              {description}
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

const emailFormSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});
type EmailFormValues = z.infer<typeof emailFormSchema>;

const codeFormSchema = z.object({
  code: z
    .string()
    .length(6, "Code must be 6 digits")
    .regex(/^\d+$/, "Code must be numeric"),
});
type CodeFormValues = z.infer<typeof codeFormSchema>;

interface EmailStepFormProps {
  onCodeSent: (email: string) => void;
  shareToken: string;
}

function EmailStepForm({ onCodeSent, shareToken }: EmailStepFormProps) {
  const doSendOtp = useSendOtpVerification({ shareToken });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
  });

  const onSubmit = async (data: EmailFormValues) => {
    const result = await doSendOtp(data.email);
    if (result.success) {
      onCodeSent(data.email);
    } else {
      setError("email", {
        message: result.error ?? "Something went wrong. Please try again.",
      });
    }
  };

  return (
    <VerificationLayout
      title="Verify your identity"
      description="If your email was invited to this frame, we’ll send you a one-time code."
    >
      <form
        className="flex w-full max-w-xl flex-col gap-4"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="otp-email">Email</Label>
          <Input
            id="otp-email"
            placeholder="you@example.com"
            {...register("email")}
            message={errors.email?.message}
            messageStatus={errors.email ? "error" : undefined}
          />
        </div>
        <div className="flex justify-end">
          <Button
            variant="primary"
            label="Send code"
            type="submit"
            disabled={isSubmitting}
          />
        </div>
      </form>
    </VerificationLayout>
  );
}

interface CodeStepFormProps {
  email: string;
  onVerified: () => void;
  shareToken: string;
}

function CodeStepForm({ email, onVerified, shareToken }: CodeStepFormProps) {
  const doSendOtp = useSendOtpVerification({ shareToken });
  const doVerifyCode = useVerifyOtpCode({ shareToken });
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CodeFormValues>({
    resolver: zodResolver(codeFormSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
  });

  const onSubmit = async (data: CodeFormValues) => {
    const result = await doVerifyCode(email, data.code);
    if (result.success) {
      onVerified();
    } else {
      setError("code", {
        message: result.error ?? "Verification failed. Please try again.",
      });
    }
  };

  const handleResend = useCallback(async () => {
    setIsResending(true);
    setResent(false);
    reset();

    const result = await doSendOtp(email);
    setIsResending(false);

    if (result.success) {
      setResent(true);
    } else {
      setError("code", {
        message: result.error ?? "Failed to resend code. Please try again.",
      });
    }
  }, [doSendOtp, email, reset, setError]);

  return (
    <VerificationLayout
      title="Enter verification code"
      description={
        <>
          If <span className="font-medium">{email}</span> was invited to this
          frame, a code is on its way.
        </>
      }
    >
      <form
        className="flex w-full max-w-xl flex-col gap-4"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="otp-code">Verification code</Label>
          <Input
            id="otp-code"
            type="number"
            placeholder="000000"
            maxLength={6}
            {...register("code")}
            message={errors.code?.message}
            messageStatus={errors.code ? "error" : undefined}
          />
        </div>
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            label={resent ? "Code sent!" : "Resend code"}
            onClick={handleResend}
            disabled={isSubmitting || isResending}
          />
          <Button
            variant="primary"
            label="Verify"
            type="submit"
            disabled={isSubmitting}
          />
        </div>
      </form>
    </VerificationLayout>
  );
}

interface EmailVerificationFlowProps {
  onVerified: () => void;
  shareToken: string;
}

export function EmailVerificationFlow({
  onVerified,
  shareToken,
}: EmailVerificationFlowProps) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");

  const handleCodeSent = (sentEmail: string) => {
    setEmail(sentEmail);
    setStep("code");
  };

  return step === "email" ? (
    <EmailStepForm onCodeSent={handleCodeSent} shareToken={shareToken} />
  ) : (
    <CodeStepForm
      email={email}
      onVerified={onVerified}
      shareToken={shareToken}
    />
  );
}
