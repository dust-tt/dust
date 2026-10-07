import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { Chip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface SandboxStatusChipProps {
  status: SandboxStatus;
}

export function SandboxStatusChip({ status }: SandboxStatusChipProps) {
  const { t } = useLingui();
  switch (status) {
    case "running":
      return <Chip size="mini" color="success" label={t`Computer running`} />;
    case "sleeping":
      return <Chip size="mini" color="warning" label={t`Computer sleeping`} />;
    case "pending_approval":
      return (
        <Chip size="mini" color="warning" label={t`Waiting for approval`} />
      );
    case "deleted":
      return <Chip size="mini" color="primary" label={t`Computer expired`} />;
    default:
      assertNever(status);
  }
}
