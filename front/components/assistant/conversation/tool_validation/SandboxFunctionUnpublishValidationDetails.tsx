interface SandboxFunctionUnpublishValidationDetailsProps {
  input: {
    slug: string;
  };
}

export function SandboxFunctionUnpublishValidationDetails({
  input,
}: SandboxFunctionUnpublishValidationDetailsProps) {
  return (
    <div className="flex flex-col gap-2 py-2">
      <p className="heading-base wrap-break-word text-foreground">
        {input.slug}
      </p>
      <p className="max-w-md text-sm leading-5 text-warning-700">
        This permanently deletes the published function and all invocation and
        tool-action history.
      </p>
      <p className="max-w-md text-sm leading-5 text-muted-foreground">
        The source file in the Pod will remain.
      </p>
    </div>
  );
}
