import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TodoDirectiveBlock, todoDirective } from "./TodoDirectiveBlock";

describe("todoDirective", () => {
  it("transforms :todo textDirective nodes with hName and hProperties", () => {
    const tree: any = {
      type: "root",
      children: [
        {
          type: "textDirective",
          name: "todo",
          attributes: { sId: "todo_abc" },
          children: [{ type: "text", value: "Ship feature" }],
        },
        {
          type: "textDirective",
          name: "todo",
          attributes: {},
          children: [{ type: "text", value: "Missing sId" }],
        },
      ],
    };

    todoDirective()(tree);

    const ok = tree.children[0];
    expect(ok.data.hName).toBe("todo");
    expect(ok.data.hProperties).toEqual({
      label: "Ship feature",
      sId: "todo_abc",
    });

    expect(tree.children[1].data).toBeUndefined();
  });
});

describe("TodoDirectiveBlock", () => {
  it("renders label and exposes sId on the wrapper", () => {
    render(<TodoDirectiveBlock label="My task" sId="sid_1" />);

    expect(screen.getByText("My task")).toBeInTheDocument();
    const wrap = document.querySelector("[data-project-todo-sid]");
    expect(wrap).toHaveAttribute("data-project-todo-sid", "sid_1");
  });
});
