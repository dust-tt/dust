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
    <div className="flex flex-col gap-1 py-2 pl-7">
      <p className="wrap-break-word text-sm font-medium leading-5 text-foreground">
        {input.slug}
      </p>
      <p className="whitespace-pre-wrap wrap-break-word text-sm leading-5 text-muted-foreground">
        {input.description}
      </p>
    </div>
  );
}
