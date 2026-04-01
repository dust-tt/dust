import { useCursorPaginationForDataTable } from "@app/hooks/useCursorPaginationForDataTable";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const PAGE_SIZE = 100;

describe("useCursorPaginationForDataTable", () => {
  it("resets pagination immediately when the reset key changes", () => {
    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) =>
        useCursorPaginationForDataTable(PAGE_SIZE, resetKey),
      {
        initialProps: { resetKey: "root" },
      }
    );

    act(() => {
      result.current.handlePaginationChange(
        { pageIndex: 1, pageSize: PAGE_SIZE },
        "next-cursor"
      );
    });

    expect(result.current.cursorPagination.cursor).toBe("next-cursor");
    expect(result.current.tablePagination.pageIndex).toBe(1);

    rerender({ resetKey: "folder" });

    expect(result.current.cursorPagination.cursor).toBeNull();
    expect(result.current.tablePagination.pageIndex).toBe(0);
  });
});
