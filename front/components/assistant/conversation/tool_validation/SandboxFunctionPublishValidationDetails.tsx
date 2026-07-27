interface SandboxFunctionPublishValidationDetailsProps {
  input: {
    description: string;
  };
}

export function SandboxFunctionPublishValidationDetails({
  input,
}: SandboxFunctionPublishValidationDetailsProps) {
  return (
    <p className="whitespace-pre-wrap wrap-break-word pt-2 text-sm leading-5 text-muted-foreground">
      {input.description}
    </p>
  );
}
