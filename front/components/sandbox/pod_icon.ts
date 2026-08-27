import type { SandboxAdminPod } from "@app/types/api/sandbox/egress_policy";
import { Cube01, CubeOutline } from "@dust-tt/sparkle";
import type { ComponentType, SVGProps } from "react";

// Central Computer admin Pods are always project spaces, so the icon is just
// open vs restricted (mirrors getSpaceIcon's project branch).
export function podIcon(
  pod: SandboxAdminPod
): ComponentType<SVGProps<SVGSVGElement>> {
  return pod.isRestricted ? CubeOutline : Cube01;
}
