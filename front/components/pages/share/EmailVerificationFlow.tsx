import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useFormatErrorDescription } from "@app/hooks/useFormatErrorDescription";
import config from "@app/lib/api/config";
import { LinkWrapper } from "@app/lib/platform";
import { useSendOtpVerification, useVerifyOtpCode } from "@app/lib/swr/share";
import { Button, DustLogo, Input, Label } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { usePostHog } from "posthog-js/react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
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
      <AppLayoutTitle className="h-12 bg-primary-50 px-4">
        <div className="flex h-full items-center">
          <LinkWrapper href={`${staticWebsiteUrl}/home`}>
            <DustLogo className="h-[20px] w-[80px]" />
          </LinkWrapper>
        </div>
      </AppLayoutTitle>
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="flex w-full max-w-md flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function getEmailFormSchema(t: (descriptor: MessageDescriptor) => string) {
  return z.object({
    email: z.string().email(t(msg`Please enter a valid email address`)),
  });
}

type EmailFormValues = z.infer<ReturnType<typeof getEmailFormSchema>>;

function getCodeFormSchema(t: (descriptor: MessageDescriptor) => string) {
  return z.object({
    code: z
      .string()
      .length(6, t(msg`Code must be 6 digits`))
      .regex(/^\d+$/, t(msg`Code must be numeric`)),
  });
}

type CodeFormValues = z.infer<ReturnType<typeof getCodeFormSchema>>;

interface EmailStepFormProps {
  onCodeSent: (email: string) => void;
  shareToken: string;
}

function EmailStepForm({ onCodeSent, shareToken }: EmailStepFormProps) {
  const { t } = useLingui();
  const emailFormSchema = useMemo(() => getEmailFormSchema(t), [t]);
  const doSendOtp = useSendOtpVerification({ shareToken });
  const formatErrorDescription = useFormatErrorDescription();
  const posthog = usePostHog();

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
      posthog.capture("frame_email_verification_requested", {
        email: data.email,
      });
      onCodeSent(data.email);
    } else {
      setError("email", { message: formatErrorDescription(result.error) });
    }
  };

  return (
    <VerificationLayout
      title={t`Verify your identity`}
      description={t`If your email was invited to this frame, we’ll send you a one-time code.`}
    >
      <form
        className="flex w-full max-w-xl flex-col gap-4"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="otp-email">
            <Trans>Email</Trans>
          </Label>
          <Input
            id="otp-email"
            placeholder={t`you@example.com`}
            {...register("email")}
            message={errors.email?.message}
            messageStatus={errors.email ? "error" : undefined}
          />
        </div>
        <div className="flex justify-end">
          <Button
            variant="primary"
            label={t`Send code`}
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
  const { t } = useLingui();
  const codeFormSchema = useMemo(() => getCodeFormSchema(t), [t]);
  const doSendOtp = useSendOtpVerification({ shareToken });
  const doVerifyCode = useVerifyOtpCode({ shareToken });
  const formatErrorDescription = useFormatErrorDescription();
  const posthog = usePostHog();
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
      posthog.identify(email);
      posthog.capture("frame_email_verified", { email });
      onVerified();
    } else {
      setError("code", { message: formatErrorDescription(result.error) });
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
      setError("code", { message: formatErrorDescription(result.error) });
    }
  }, [doSendOtp, email, reset, setError, formatErrorDescription]);

  return (
    <VerificationLayout
      title={t`Enter verification code`}
      description={
        <Trans>
          If <span className="font-medium">{email}</span> was invited to this
          frame, a code is on its way.
        </Trans>
      }
    >
      <form
        className="flex w-full max-w-xl flex-col gap-4"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="otp-code">
            <Trans>Verification code</Trans>
          </Label>
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
            label={resent ? t`Code sent!` : t`Resend code`}
            onClick={handleResend}
            disabled={isSubmitting || isResending}
          />
          <Button
            variant="primary"
            label={t`Verify`}
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
