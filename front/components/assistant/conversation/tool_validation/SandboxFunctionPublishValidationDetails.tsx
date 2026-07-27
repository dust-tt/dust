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
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-sm text-muted-foreground">
        The agent wants to publish this function to this Pod.
      </p>

      <div className="overflow-hidden rounded-xl border border-separator bg-background">
        <div className="flex flex-col gap-1.5 px-3 py-3">
          <div className="text-xs font-medium text-muted-foreground">
            Function
          </div>
          <div className="wrap-break-word text-sm font-medium text-foreground">
            {input.slug}
          </div>
          <p className="whitespace-pre-wrap wrap-break-word text-sm leading-5 text-muted-foreground">
            {input.description}
          </p>
        </div>
      </div>
    </div>
  );
}
