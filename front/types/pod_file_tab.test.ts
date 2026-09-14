import type { PodFileTab } from "@app/types/pod_file_tab";
import {
  orderedPodFileTabs,
  podFileTabBasename,
  reorderFileTabsInTabsOrder,
} from "@app/types/pod_file_tab";
import { describe, expect, it } from "vitest";

describe("podFileTabBasename", () => {
  it("strips frame extensions", () => {
    expect(podFileTabBasename("pod-p1/frames/Dashboard.tsx")).toBe("Dashboard");
    expect(podFileTabBasename("Activity.jsx")).toBe("Activity");
  });

  it("strips markdown and other previewable extensions", () => {
    expect(podFileTabBasename("pod-p1/notes/readme.md")).toBe("readme");
    expect(podFileTabBasename("report.pdf")).toBe("report");
    expect(podFileTabBasename("data.csv")).toBe("data");
  });

  it("keeps names without extensions", () => {
    expect(podFileTabBasename("pod-p1/notes/README")).toBe("README");
  });
});

describe("reorderFileTabsInTabsOrder", () => {
  it("reorders file tabs while keeping system-tab slots fixed", () => {
    const tabsOrder = [
      "conversations",
      "a.tsx",
      "files",
      "b.md",
      "tasks",
      "c.tsx",
    ];

    expect(reorderFileTabsInTabsOrder(tabsOrder, "c.tsx", "a.tsx")).toEqual([
      "conversations",
      "c.tsx",
      "files",
      "a.tsx",
      "tasks",
      "b.md",
    ]);
  });

  it("returns null when the drag is a no-op or paths are missing", () => {
    const tabsOrder = ["conversations", "a.tsx", "files", "b.md"];
    expect(reorderFileTabsInTabsOrder(tabsOrder, "a.tsx", "a.tsx")).toBeNull();
    expect(
      reorderFileTabsInTabsOrder(tabsOrder, "missing", "a.tsx")
    ).toBeNull();
  });
});

describe("orderedPodFileTabs", () => {
  it("returns file tabs in nav order", () => {
    const tabs: PodFileTab[] = [
      { path: "b.md", title: "B", icon: "ActionDashboardIcon" },
      { path: "a.tsx", title: "A", icon: "ActionDashboardIcon" },
    ];

    expect(
      orderedPodFileTabs(tabs, ["conversations", "b.md", "files", "a.tsx"]).map(
        (tab) => tab.path
      )
    ).toEqual(["b.md", "a.tsx"]);
  });
});
