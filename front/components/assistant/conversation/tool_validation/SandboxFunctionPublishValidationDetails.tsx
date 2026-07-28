interface SandboxFunctionPublishValidationDetailsProps {
  input: {
    slug: string;
    description: string;
  };
}

export function SandboxFunctionPublishValidationDetails({
  input,
}: SandboxFunctionPublishValidationDetailsProps) {
  return (
    <div className="flex flex-col gap-1.5 pb-1 pt-2">
      <p className="heading-base wrap-break-word text-foreground">
        {input.slug}
      </p>
      <p className="max-w-md whitespace-pre-wrap wrap-break-word text-sm leading-5 text-muted-foreground">
        {input.description}
      </p>
    </div>
  );
}
