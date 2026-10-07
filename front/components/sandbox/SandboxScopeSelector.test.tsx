import type { SandboxScopeSelection } from "@app/components/sandbox/SandboxScopeSelector";
import { labelForSelection } from "@app/components/sandbox/SandboxScopeSelector";
import { i18n } from "@app/lib/i18n/i18n";
import type { SandboxAdminPod } from "@app/types/api/sandbox/egress_policy";
import type { MessageDescriptor } from "@lingui/core";
import { describe, expect, it } from "vitest";

const translate = (descriptor: MessageDescriptor) => i18n._(descriptor);

const pods: SandboxAdminPod[] = [
  { sId: "vlt_a", name: "Alpha", isRestricted: false },
  { sId: "vlt_b", name: "Beta", isRestricted: true },
  { sId: "vlt_c", name: "Gamma", isRestricted: false },
];

function selection(
  overrides: Partial<SandboxScopeSelection> = {}
): SandboxScopeSelection {
  return { includeWorkspace: false, podIds: [], ...overrides };
}

describe("labelForSelection", () => {
  it("returns the placeholder when nothing is selected", () => {
    expect(labelForSelection(selection(), pods, translate)).toBe(
      "Select scope"
    );
  });

  it("labels the workspace alone", () => {
    expect(
      labelForSelection(selection({ includeWorkspace: true }), pods, translate)
    ).toBe("Workspace");
  });

  it("names a single selected Pod", () => {
    expect(
      labelForSelection(selection({ podIds: ["vlt_b"] }), pods, translate)
    ).toBe("Beta");
  });

  it("counts multiple selected Pods", () => {
    expect(
      labelForSelection(
        selection({ podIds: ["vlt_a", "vlt_b"] }),
        pods,
        translate
      )
    ).toBe("2 Pods");
  });

  it("collapses every Pod to 'All Pods'", () => {
    expect(
      labelForSelection(
        selection({ podIds: ["vlt_a", "vlt_b", "vlt_c"] }),
        pods,
        translate
      )
    ).toBe("All Pods");
  });

  it("combines the workspace and a Pod", () => {
    expect(
      labelForSelection(
        selection({ includeWorkspace: true, podIds: ["vlt_a"] }),
        pods,
        translate
      )
    ).toBe("Workspace + Alpha");
  });

  it("returns 'All scopes' when the workspace and every Pod are selected", () => {
    expect(
      labelForSelection(
        selection({
          includeWorkspace: true,
          podIds: ["vlt_a", "vlt_b", "vlt_c"],
        }),
        pods,
        translate
      )
    ).toBe("All scopes");
  });

  it("ignores selected Pods that are no longer in the list", () => {
    expect(
      labelForSelection(
        selection({ includeWorkspace: true, podIds: ["vlt_a", "vlt_gone"] }),
        pods,
        translate
      )
    ).toBe("Workspace + Alpha");
  });

  it("does not read as 'All scopes' when a stale id pads the count", () => {
    // Two selected ids but only one still exists: not every current Pod.
    expect(
      labelForSelection(
        selection({ includeWorkspace: true, podIds: ["vlt_a", "vlt_gone"] }),
        [pods[0], pods[1]],
        translate
      )
    ).toBe("Workspace + Alpha");
  });
});
