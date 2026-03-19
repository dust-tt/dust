import { useSendOtpVerification, useVerifyOtpCode } from "@app/lib/swr/share";
import { Button, Input, Label } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
    <form className="flex flex-col gap-3" onSubmit={handleSubmit(onSubmit)}>
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
      <Button
        variant="primary"
        label="Send code"
        type="submit"
        disabled={isSubmitting}
      />
    </form>
  );
}

interface CodeStepFormProps {
  email: string;
  onResend: () => void;
  onVerified: () => void;
  shareToken: string;
}

function CodeStepForm({
  email,
  onResend,
  onVerified,
  shareToken,
}: CodeStepFormProps) {
  const doVerifyCode = useVerifyOtpCode({ shareToken });

  const {
    register,
    handleSubmit,
    setError,
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

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-1">
        <Label htmlFor="otp-code">Verification code</Label>
        <Input
          id="otp-code"
          placeholder="000000"
          maxLength={6}
          {...register("code")}
          message={errors.code?.message}
          messageStatus={errors.code ? "error" : undefined}
        />
      </div>
      <Button
        variant="primary"
        label="Verify"
        type="submit"
        disabled={isSubmitting}
      />
      <Button
        variant="ghost"
        label="Resend code"
        onClick={onResend}
        disabled={isSubmitting}
      />
    </form>
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

  const handleCodeSent = useCallback((sentEmail: string) => {
    setEmail(sentEmail);
    setStep("code");
  }, []);

  const handleResend = useCallback(() => {
    setStep("email");
  }, []);

  return (
    <div className="flex h-dvh w-full items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 px-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Email verification required</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "email"
              ? "Enter your email to receive a verification code."
              : "Enter the 6-digit code sent to your email."}
          </p>
        </div>

        {step === "email" ? (
          <EmailStepForm onCodeSent={handleCodeSent} shareToken={shareToken} />
        ) : (
          <CodeStepForm
            email={email}
            onResend={handleResend}
            onVerified={onVerified}
            shareToken={shareToken}
          />
        )}
      </div>
    </div>
  );
}
