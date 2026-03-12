import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { Chip } from "@dust-tt/sparkle";

interface SandboxStatusChipProps {
  status: SandboxStatus;
}

export function SandboxStatusChip({ status }: SandboxStatusChipProps) {
  switch (status) {
    case "running":
      return <Chip size="mini" color="success" label="Sandbox running" />;
    case "sleeping":
      return <Chip size="mini" color="warning" label="Sandbox sleeping" />;
    case "deleted":
      return <Chip size="mini" color="primary" label="Sandbox expired" />;
    default:
      assertNever(status);
  }
}
