import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { CodeBlock, Spinner } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";

interface FrameCodeViewProps {
  code?: string;
  hasError: boolean;
  isLoading: boolean;
}

export function FrameCodeView({
  code,
  hasError,
  isLoading,
}: FrameCodeViewProps) {
  if (isLoading) {
    return (
      <CenteredState>
        <Spinner size="sm" />
      </CenteredState>
    );
  }

  if (hasError) {
    return (
      <CenteredState>
        <p className="text-warning-500">
          <Trans>Error loading the Frame source.</Trans>
        </p>
      </CenteredState>
    );
  }

  return (
    <div className="h-full overflow-auto px-4">
      <CodeBlock wrapLongLines className="language-tsx">
        {code}
      </CodeBlock>
    </div>
  );
}
