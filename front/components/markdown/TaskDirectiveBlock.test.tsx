import type { LightWorkspaceType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getTaskDirectiveBlock, taskDirective } from "./TaskDirectiveBlock";

const mockOwner = { sId: "w_test_ws" } as LightWorkspaceType;

describe("taskDirective", () => {
  it("transforms :project_task … textDirective nodes with hName project_task and hProperties", () => {
    const tree: any = {
      type: "root",
      children: [
        {
          type: "textDirective",
          name: "project_task",
          attributes: { sId: "pt_abc" },
          children: [{ type: "text", value: "Ship feature" }],
        },
      ],
    };

    taskDirective()(tree);

    const ok = tree.children[0];
    expect(ok.data.hName).toBe("project_task");
    expect(ok.data.hProperties).toEqual({
      label: "Ship feature",
      sId: "pt_abc",
    });
  });

  it("maps legacy :todo with sId to hName project_task", () => {
    const tree: any = {
      type: "root",
      children: [
        {
          type: "textDirective",
          name: "todo",
          attributes: { sId: "legacy_1" },
          children: [{ type: "text", value: "Old label" }],
        },
      ],
    };

    taskDirective()(tree);

    expect(tree.children[0].data.hName).toBe("project_task");
    expect(tree.children[0].data.hProperties).toEqual({
      label: "Old label",
      sId: "legacy_1",
    });
  });

  it("does not transform :todo without sId", () => {
    const tree: any = {
      type: "root",
      children: [
        {
          type: "textDirective",
          name: "todo",
          attributes: {},
          children: [{ type: "text", value: "Missing sId" }],
        },
      ],
    };

    taskDirective()(tree);

    expect(tree.children[0].data).toBeUndefined();
  });
});

describe("getTaskDirectiveBlock", () => {
  it("renders label and exposes sId on the wrapper", () => {
    const TaskChip = getTaskDirectiveBlock(mockOwner);
    render(<TaskChip label="My task" sId="sid_1" />);

    expect(screen.getByText("My task")).toBeInTheDocument();
    const wrap = document.querySelector("[data-project-task-sid]");
    expect(wrap).toHaveAttribute("data-project-task-sid", "sid_1");
  });
});
