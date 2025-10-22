import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/types";
import {
  getEditAndRenameActionsToApply,
  getFileActionsByType,
  getRevertedContent,
  isCreateFileActionForFileId,
} from "@app/lib/api/files/client_executable";
import type { AgentMCPActionModel } from "@app/lib/models/assistant/actions/mcp";
import { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";

// Mock the AgentMCPActionOutputItem.findAll method
vi.mock("@app/lib/models/assistant/actions/mcp", () => ({
  AgentMCPActionOutputItem: {
    findAll: vi.fn(),
  },
}));

const mockAgentMCPActionOutputItemFindAll = vi.mocked(
  AgentMCPActionOutputItem.findAll
);

const createEditAction = (
  id: string,
  agentMessageId: string,
  createdAt: Date,
  oldString: string = "old",
  newString: string = "new",
  fileId?: string
) =>
  ({
    id,
    agentMessageId,
    createdAt,
    toolConfiguration: {
      originalName: EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    },
    augmentedInputs: {
      old_string: oldString,
      new_string: newString,
      ...(fileId && { file_id: fileId }),
    },
  }) as unknown as AgentMCPActionModel;

const createRevertAction = (
  id: string,
  agentMessageId: string,
  createdAt: Date,
  fileId?: string
) =>
  ({
    id,
    agentMessageId,
    createdAt,
    toolConfiguration: {
      originalName: REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    },
    augmentedInputs: {
      ...(fileId && { file_id: fileId }),
    },
  }) as unknown as AgentMCPActionModel;

const createCreateFileAction = (content: string) =>
  ({
    id: "create-1",
    agentMessageId: "msg1",
    createdAt: new Date(1000),
    toolConfiguration: {
      originalName: CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    },
    augmentedInputs: {
      content,
      file_name: "TestFile.tsx",
    },
  }) as unknown as AgentMCPActionModel;

describe("isCreateFileActionForFileId", () => {
  const workspace = { id: 123 } as any;
  const fileId = "correct_file_id";

  const mockAction = createCreateFileAction("test content");
  const mockActionNonCreate = createEditAction(
    "test-edit-action",
    "msg1",
    new Date()
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true when action is create file action with valid outputs", async () => {
    const mockOutput = {
      content: {
        resource: {
          fileId: "correct_file_id",
        },
      },
    };

    mockAgentMCPActionOutputItemFindAll.mockResolvedValueOnce([
      mockOutput as any,
    ]);

    const result = await isCreateFileActionForFileId({
      action: mockAction,
      workspace,
      fileId,
    });
    expect(result).toBe(true);
  });

  it("should return false when action is not a create file action", async () => {
    const result = await isCreateFileActionForFileId({
      action: mockActionNonCreate,
      workspace,
      fileId,
    });

    expect(result).toBe(false);
  });

  it("should return false when no create file outputs are found", async () => {
    mockAgentMCPActionOutputItemFindAll.mockResolvedValueOnce([]);

    const result = await isCreateFileActionForFileId({
      action: mockAction,
      workspace,
      fileId,
    });
    expect(result).toBe(false);
  });

  it("should throw error when multiple create file outputs are found for the same file", async () => {
    const mockOutput1 = {
      content: {
        resource: {
          fileId: "correct_file_id",
        },
      },
    };
    const mockOutput2 = {
      content: {
        resource: {
          fileId: "correct_file_id",
        },
      },
    };

    mockAgentMCPActionOutputItemFindAll.mockResolvedValueOnce([
      mockOutput1 as any,
      mockOutput2 as any,
    ]);

    await expect(
      isCreateFileActionForFileId({ action: mockAction, workspace, fileId })
    ).rejects.toThrow(
      "Multiple create file actions found for file_id correct_file_id."
    );
  });
});

describe("getFileActionsByType", () => {
  const workspace = { id: 123 } as any;
  const fileId = "correct_file_id";

  const createAction = createCreateFileAction("test content");
  const editAction = createEditAction(
    "edit-1",
    "msg1",
    new Date(),
    "old",
    "new",
    fileId
  );
  const revertAction = createRevertAction(
    "revert-1",
    "msg1",
    new Date(),
    fileId
  );
  const editActionDifferentFile = createEditAction(
    "edit-2",
    "msg1",
    new Date(),
    "old",
    "new",
    "different-file-id"
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should categorize actions correctly when all types are present", async () => {
    const mockCreateOutput = {
      content: {
        resource: {
          fileId: fileId,
        },
      },
    };

    mockAgentMCPActionOutputItemFindAll.mockResolvedValue([
      mockCreateOutput as any,
    ]);

    const actions = [
      createAction,
      editAction,
      revertAction,
      editActionDifferentFile,
    ];
    const result = await getFileActionsByType(actions, fileId, workspace);

    expect(result.createFileAction).toBe(createAction);
    expect(result.nonCreateFileActions).toEqual([editAction, revertAction]);
  });

  it("should return null createFileAction when no create action exists", async () => {
    mockAgentMCPActionOutputItemFindAll.mockResolvedValue([]);

    const actions = [editAction, revertAction];
    const result = await getFileActionsByType(actions, fileId, workspace);

    expect(result.createFileAction).toBeNull();
    expect(result.nonCreateFileActions).toEqual([editAction, revertAction]);
  });

  it("should return empty clientExecutableFileActions when no edit/revert actions exist", async () => {
    const mockCreateOutput = {
      content: {
        resource: {
          fileId: fileId,
        },
      },
    };

    mockAgentMCPActionOutputItemFindAll.mockResolvedValue([
      mockCreateOutput as any,
    ]);

    const actions = [createAction];
    const result = await getFileActionsByType(actions, fileId, workspace);

    expect(result.createFileAction).toBe(createAction);
    expect(result.nonCreateFileActions).toEqual([]);
  });

  it("should filter actions by fileId correctly", async () => {
    mockAgentMCPActionOutputItemFindAll.mockResolvedValue([]);

    const actions = [createAction, editAction, editActionDifferentFile];
    const result = await getFileActionsByType(actions, fileId, workspace);

    expect(result.createFileAction).toBeNull();
    expect(result.nonCreateFileActions).toEqual([editAction]);
    expect(result.nonCreateFileActions).not.toContain(editActionDifferentFile);
  });

  it("should return empty results when no matching actions exist", async () => {
    mockAgentMCPActionOutputItemFindAll.mockResolvedValue([]);

    const actions = [editActionDifferentFile];
    const result = await getFileActionsByType(actions, fileId, workspace);

    expect(result.createFileAction).toBeNull();
    expect(result.nonCreateFileActions).toEqual([]);
  });

  it("should handle empty actions array", async () => {
    const actions: AgentMCPActionModel[] = [];
    const result = await getFileActionsByType(actions, fileId, workspace);

    expect(result.createFileAction).toBeNull();
    expect(result.nonCreateFileActions).toEqual([]);
  });
});

describe("getEditAndRenameActionsToApply", () => {
  it("should skip the last edit action when no reverts are present", () => {
    const edit1 = createEditAction("edit1", "msg1", new Date(1000));
    const edit2 = createEditAction("edit2", "msg2", new Date(2000));
    const edit3 = createEditAction("edit3", "msg3", new Date(3000));

    const result = getEditAndRenameActionsToApply([edit1, edit2, edit3]);

    // Should skip newest edit group (msg3) and return msg2, msg1
    expect(result).toEqual([edit2, edit1]);
  });

  it("should skip edit actions that are immediately followed by reverts", () => {
    const edit1 = createEditAction("edit1", "msg1", new Date(1000));
    const edit2 = createEditAction("edit2", "msg2", new Date(2000));
    const revert1 = createRevertAction("revert1", "msg3", new Date(3000));

    const result = getEditAndRenameActionsToApply([edit1, edit2, revert1]);

    // Current revert (1) + revert action count=1 = 2 total reverts
    // Should cancel msg2 and msg1, leaving nothing
    expect(result).toEqual([]);
  });

  it("should properly group edits from same agent message when reverting", () => {
    const edit1a = createEditAction("edit1a", "msg1", new Date(1000));
    const edit1b = createEditAction("edit1b", "msg1", new Date(1100));
    const edit2 = createEditAction("edit2", "msg2", new Date(2000));

    const result = getEditAndRenameActionsToApply([edit1a, edit1b, edit2]);

    expect(result).toEqual([edit1a, edit1b]);
  });

  it("should handle consecutive revert attempts when last action was revert", () => {
    const edit1 = createEditAction("edit1", "msg1", new Date(1000));
    const edit2 = createEditAction("edit2", "msg2", new Date(2000));
    const revert1 = createRevertAction("revert1", "msg3", new Date(3000));

    const result = getEditAndRenameActionsToApply([edit1, edit2, revert1]);

    expect(result).toEqual([]);
  });

  it("should return empty array when all edits are reverted", () => {
    const edit1 = createEditAction("edit1", "msg1", new Date(1000));
    const revert1 = createRevertAction("revert1", "msg2", new Date(2000));

    const result = getEditAndRenameActionsToApply([edit1, revert1]);

    expect(result).toEqual([]);
  });

  it("should handle complex scenario with mixed edits and reverts", () => {
    const edit1 = createEditAction("edit1", "msg1", new Date(1000));
    const edit2 = createEditAction("edit2", "msg1", new Date(1100));
    const edit3 = createEditAction("edit3", "msg2", new Date(2000));
    const revert1 = createRevertAction("revert1", "msg3", new Date(3000));
    const edit4 = createEditAction("edit4", "msg4", new Date(4000));
    const edit5 = createEditAction("edit5", "msg4", new Date(4100));

    const result = getEditAndRenameActionsToApply([
      edit1,
      edit2,
      edit3,
      revert1,
      edit4,
      edit5,
    ]);

    // Processing newest → oldest:
    // msg4: counter=1>0, edit-only group, skip and decrement counter to 0
    // msg3: counter=0, see revert, increase counter to 1
    // msg2: counter=1>0, edit-only group, skip and decrement counter to 0
    // msg1: counter=0, collect edit1, edit2
    expect(result).toEqual([edit1, edit2]);
  });

  it("should handle multiple reverts in same message group", () => {
    const edit1 = createEditAction("edit1", "msg1", new Date(1000));
    const edit2 = createEditAction("edit2", "msg2", new Date(2000));
    const edit3 = createEditAction("edit3", "msg3", new Date(3000));
    const revert1 = createRevertAction("revert1", "msg4", new Date(4000));
    const revert2 = createRevertAction("revert2", "msg4", new Date(4100));

    const result = getEditAndRenameActionsToApply([
      edit1,
      edit2,
      edit3,
      revert1,
      revert2,
    ]);

    // Current revert (1) + revert1 + revert2 = 3 total reverts
    // Should cancel all 3 edit groups (msg3, msg2, msg1)
    expect(result).toEqual([]);
  });

  it("should handle empty actions array", () => {
    const result = getEditAndRenameActionsToApply([]);
    expect(result).toEqual([]);
  });

  it("should handle revert action in historical data", () => {
    const edit1 = createEditAction("edit1", "msg1", new Date(1000));
    const edit2 = createEditAction("edit2", "msg2", new Date(2000));
    const edit3 = createEditAction("edit3", "msg3", new Date(3000));
    const revert1 = createRevertAction("revert1", "msg4", new Date(4000));

    const result = getEditAndRenameActionsToApply([
      edit1,
      edit2,
      edit3,
      revert1,
    ]);

    // Current revert (1) + revert action (1) = 2 total reverts
    // Should cancel msg3 and msg2, leaving msg1
    expect(result).toEqual([edit1]);
  });

  describe("getRevertedContent", () => {
    const originalReactComponent = `import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const SuperSimple = () => {
  return (
    <div className="w-full max-w-md mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">Hello World!</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-gray-600">
            This is a super simple React component created with shadcn/ui components.
          </p>
          <Button className="w-full mt-4">Click Me</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperSimple;`;

    it("should return original content when no actions to apply", () => {
      const createAction = createCreateFileAction(originalReactComponent);
      const actionsToApply: AgentMCPActionModel[] = [];

      const result = getRevertedContent(createAction, actionsToApply);

      expect(result).toBe(originalReactComponent);
    });

    it("should apply a single edit action", () => {
      const createAction = createCreateFileAction(originalReactComponent);

      const editAction = createEditAction(
        "edit1",
        "msg2",
        new Date(2000),
        `      <Card>
        <CardHeader>
          <CardTitle className="text-center">Hello World!</CardTitle>
        </CardHeader>`,
        `      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-center text-blue-800">Welcome to Dust!</CardTitle>
        </CardHeader>`
      );

      const result = getRevertedContent(createAction, [editAction]);

      expect(result).toContain("Welcome to Dust!");
      expect(result).toContain("bg-blue-50 border-blue-200");
      expect(result).toContain("text-blue-800");
      expect(result).not.toContain("Hello World!");
    });

    it("should apply multiple edits in chronological order", () => {
      const createAction = createCreateFileAction(originalReactComponent);

      const edit1 = createEditAction(
        "edit1",
        "msg2",
        new Date(2000),
        `      <Card>
        <CardHeader>
          <CardTitle className="text-center">Hello World!</CardTitle>
        </CardHeader>`,
        `      <Card className="bg-pink-50 border-pink-200">
        <CardHeader>
          <CardTitle className="text-center text-pink-800">Welcome to Dust!</CardTitle>
        </CardHeader>`
      );

      const edit2 = createEditAction(
        "edit2",
        "msg3",
        new Date(3000),
        `          <p className="text-center text-gray-600">
            This is a super simple React component created with shadcn/ui components.
          </p>`,
        `          <p className="text-center text-pink-600">
            This is a beautiful React component with a pink theme.
          </p>`
      );

      const edit3 = createEditAction(
        "edit3",
        "msg4",
        new Date(4000),
        `          <Button className="w-full mt-4">Click Me</Button>`,
        `          <Button className="w-full mt-4 bg-pink-500 hover:bg-pink-600">
            Get Started
          </Button>`
      );

      const result = getRevertedContent(createAction, [edit1, edit2, edit3]);

      expect(result).toContain("Welcome to Dust!");
      expect(result).toContain("bg-pink-50 border-pink-200");
      expect(result).toContain(
        "This is a beautiful React component with a pink theme."
      );
      expect(result).toContain("bg-pink-500 hover:bg-pink-600");
      expect(result).toContain("Get Started");
      expect(result).not.toContain("Hello World!");
      expect(result).not.toContain("Click Me");
    });

    it("should apply edits in chronological order even when passed out of order", () => {
      const createAction = createCreateFileAction(originalReactComponent);

      const edit1 = createEditAction(
        "edit1",
        "msg2",
        new Date(2000),
        "Hello World!",
        "Step 1"
      );

      const edit2 = createEditAction(
        "edit2",
        "msg3",
        new Date(3000),
        "Step 1",
        "Step 2"
      );

      const edit3 = createEditAction(
        "edit3",
        "msg4",
        new Date(4000),
        "Step 2",
        "Final Step"
      );

      // Pass actions out of chronological order
      const result = getRevertedContent(createAction, [edit3, edit1, edit2]);

      expect(result).toContain("Final Step");
      expect(result).not.toContain("Hello World!");
      expect(result).not.toContain("Step 1");
      expect(result).not.toContain("Step 2");
    });

    it("should handle component structure changes", () => {
      const createAction = createCreateFileAction(originalReactComponent);

      const edit1 = createEditAction(
        "edit1",
        "msg2",
        new Date(2000),
        `        <CardContent>
          <p className="text-center text-gray-600">
            This is a super simple React component created with shadcn/ui components.
          </p>
          <Button className="w-full mt-4">Click Me</Button>
        </CardContent>`,
        `        <CardContent>
          <p className="text-center text-gray-600">
            This is a super simple React component created with shadcn/ui components.
          </p>
          <div className="space-y-3">
            <Button className="w-full">Click Me</Button>
            <Button variant="secondary" className="w-full">
              Learn More
            </Button>
          </div>
        </CardContent>`
      );

      const result = getRevertedContent(createAction, [edit1]);

      expect(result).toContain('div className="space-y-3"');
      expect(result).toContain('variant="secondary"');
      expect(result).toContain("Learn More");
    });

    it("should throw error when old_string is not found", () => {
      const createAction = createCreateFileAction(originalReactComponent);

      const editAction = createEditAction(
        "edit1",
        "msg2",
        new Date(2000),
        "This string does not exist in the component",
        "New content"
      );

      expect(() => getRevertedContent(createAction, [editAction])).toThrow(
        'Cannot find matched text: "This string does not exist in the component"'
      );
    });

    it("should handle import statement changes", () => {
      const createAction = createCreateFileAction(originalReactComponent);

      const edit1 = createEditAction(
        "edit1",
        "msg2",
        new Date(2000),
        `import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";`,
        `import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";`
      );

      const result = getRevertedContent(createAction, [edit1]);

      expect(result).toContain('import React, { useState } from "react";');
      expect(result).toContain(
        'import { Badge } from "@/components/ui/badge";'
      );
      expect(result).not.toMatch(/^import React from "react";$/m);
    });
  });
});
