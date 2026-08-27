import {
  buildDomainRows,
  buildPendingRequests,
  MultiPodNetworkSection,
} from "@app/components/sandbox/MultiPodNetworkSection";
import type { SandboxAdminPod } from "@app/types/api/sandbox/egress_policy";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import type { LightWorkspaceType } from "@app/types/user";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { bulkUpdateMock, mutatePodPoliciesMock, mutateWorkspaceMock } =
  vi.hoisted(() => ({
    bulkUpdateMock: vi.fn(),
    mutatePodPoliciesMock: vi.fn(),
    mutateWorkspaceMock: vi.fn(),
  }));

vi.mock("@app/lib/swr/sandbox", () => ({
  useBulkPodEgressPolicies: () => ({
    podPolicies: [],
    isPodPoliciesLoading: false,
    isPodPoliciesError: false,
    mutatePodPolicies: mutatePodPoliciesMock,
  }),
  useWorkspaceEgressPolicy: () => ({
    policy: { allowedDomains: [] },
    requestedDomains: [],
    isWorkspaceEgressPolicyLoading: false,
    isWorkspaceEgressPolicyError: false,
    mutateWorkspaceEgressPolicy: mutateWorkspaceMock,
  }),
  useBulkUpdateEgressDomain: () => ({
    bulkUpdateEgressDomain: bulkUpdateMock,
    isBulkUpdatingEgressDomain: false,
  }),
  useDismissWorkspaceEgressRequest: () => ({
    dismissWorkspaceEgressRequest: vi.fn(),
    isDismissingRequest: false,
  }),
  useDismissPodEgressRequestByPod: () => ({
    dismissPodEgressRequest: vi.fn(),
    isDismissingPodEgressRequest: false,
  }),
}));

const podA: SandboxAdminPod = {
  sId: "vlt_a",
  name: "Alpha",
  isRestricted: false,
};
const podB: SandboxAdminPod = {
  sId: "vlt_b",
  name: "Beta",
  isRestricted: true,
};

function policy(
  allowedDomains: string[],
  requestedDomains: { domain: string; requestedAtMs: number }[] = []
): EgressPolicy {
  return { allowedDomains, requestedDomains };
}

describe("buildDomainRows", () => {
  it("unions workspace and Pod domains, sorted", () => {
    const rows = buildDomainRows({
      workspaceAllowedDomains: ["b.com"],
      podPolicies: [{ podId: podA.sId, policy: policy(["a.com"]) }],
      selectedPods: [podA],
      includeWorkspace: true,
    });

    expect(rows.map((row) => row.domain)).toEqual(["a.com", "b.com"]);
  });

  it("marks a workspace domain as inherited and removable only at the workspace", () => {
    const [row] = buildDomainRows({
      workspaceAllowedDomains: ["shared.com"],
      podPolicies: [{ podId: podA.sId, policy: policy([]) }],
      selectedPods: [podA],
      includeWorkspace: true,
    });

    expect(row.inWorkspace).toBe(true);
    expect(row.ownedByPods).toEqual([]);
    expect(row.removableScopeCount).toBe(1);
  });

  it("cannot remove an inherited-only domain when the workspace is not selected", () => {
    const [row] = buildDomainRows({
      workspaceAllowedDomains: ["shared.com"],
      podPolicies: [{ podId: podA.sId, policy: policy([]) }],
      selectedPods: [podA],
      includeWorkspace: false,
    });

    expect(row.inWorkspace).toBe(true);
    expect(row.removableScopeCount).toBe(0);
  });

  it("counts the workspace plus each owning Pod as removable", () => {
    const [row] = buildDomainRows({
      workspaceAllowedDomains: ["shared.com"],
      podPolicies: [
        { podId: podA.sId, policy: policy(["shared.com"]) },
        { podId: podB.sId, policy: policy(["shared.com"]) },
      ],
      selectedPods: [podA, podB],
      includeWorkspace: true,
    });

    expect(row.ownedByPods.map((pod) => pod.sId)).toEqual([podA.sId, podB.sId]);
    expect(row.removableScopeCount).toBe(3);
  });
});

describe("buildPendingRequests", () => {
  it("keeps workspace requests not yet allowed and drops covered ones", () => {
    const rows = buildPendingRequests({
      workspaceRequestedDomains: [
        { domain: "new.com" },
        { domain: "already.com" },
      ],
      workspaceAllowedDomains: ["already.com"],
      podPolicies: [],
      selectedPods: [],
      includeWorkspace: true,
    });

    expect(rows.map((row) => row.domain)).toEqual(["new.com"]);
    expect(rows[0].scopeKind).toBe("workspace");
  });

  it("skips workspace requests when the workspace is not selected", () => {
    const rows = buildPendingRequests({
      workspaceRequestedDomains: [{ domain: "new.com" }],
      workspaceAllowedDomains: [],
      podPolicies: [],
      selectedPods: [],
      includeWorkspace: false,
    });

    expect(rows).toEqual([]);
  });

  it("surfaces a Pod request tied to its originating Pod", () => {
    const rows = buildPendingRequests({
      workspaceRequestedDomains: [],
      workspaceAllowedDomains: [],
      podPolicies: [
        {
          podId: podA.sId,
          policy: policy([], [{ domain: "pod.com", requestedAtMs: 1 }]),
        },
      ],
      selectedPods: [podA],
      includeWorkspace: false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      domain: "pod.com",
      scopeKind: "pod",
      scopeName: "Alpha",
    });
  });
});

describe("MultiPodNetworkSection mutation flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates after a partial-failure add so changed scopes are not left stale", async () => {
    // A bulk write can return 200 with mixed results (the hook then returns
    // false), but some scopes may have changed — so the reads must still
    // revalidate, not only on full success.
    bulkUpdateMock.mockResolvedValue(false);

    render(
      <MultiPodNetworkSection
        owner={{ sId: "wId" } as LightWorkspaceType}
        includeWorkspace
        selection={null}
        selectedPods={[]}
      />
    );

    await userEvent.type(screen.getByRole("textbox"), "api.openai.com");
    await userEvent.click(screen.getByRole("button", { name: "Add domain" }));

    expect(bulkUpdateMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mutatePodPoliciesMock).toHaveBeenCalled();
      expect(mutateWorkspaceMock).toHaveBeenCalled();
    });
  });
});
