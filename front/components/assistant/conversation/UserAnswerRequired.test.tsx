import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { LightWorkspaceType } from "@app/types/user";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserAnswerRequired } from "./UserAnswerRequired";

const removeCompletedActionMock = vi.fn();
const answerQuestionMock = vi.fn();

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { sId: "user_1" },
  }),
}));

vi.mock(
  "@app/components/assistant/conversation/BlockedActionsProvider",
  () => ({
    useBlockedActionsContext: () => ({
      removeCompletedAction: removeCompletedActionMock,
    }),
  })
);

vi.mock("@app/hooks/useAnswerUserQuestion", () => ({
  useAnswerUserQuestion: () => ({
    answerQuestion: answerQuestionMock,
    isSubmitting: false,
    errorMessage: null,
  }),
}));

vi.mock("@dust-tt/sparkle", () => {
  const cn = (...values: Array<unknown>) =>
    values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter(Boolean)
      .join(" ");

  const OptionCard = ({
    label,
    description,
    selected,
    className,
    onClick,
    disabled,
  }: {
    label: string;
    description?: string | null;
    selected?: boolean;
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      disabled={disabled}
      className={className}
      data-selected={selected ? "true" : "false"}
    >
      <span>{label}</span>
      {description ? <span>{description}</span> : null}
    </button>
  );

  const Card = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>;

  const Counter = ({ value }: { value: number }) => <span>{value}</span>;

  const Input = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement> & {
      containerClassName?: string;
    }
  >(({ containerClassName, ...props }, ref) => (
    <div className={containerClassName}>
      <input ref={ref} {...props} />
    </div>
  ));
  Input.displayName = "Input";

  const Button = ({
    label,
    onClick,
    disabled,
    isLoading,
    "aria-label": ariaLabel,
  }: {
    label?: string;
    onClick?: () => void;
    disabled?: boolean;
    isLoading?: boolean;
    "aria-label"?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      aria-label={ariaLabel}
    >
      {label ?? ariaLabel}
    </button>
  );

  const Spinner = () => <div>Loading</div>;
  const ArrowUpIcon = () => null;

  return {
    ArrowUpIcon,
    Button,
    Card,
    Counter,
    cn,
    Input,
    OptionCard,
    Spinner,
  };
});

const owner = {
  id: 1,
  sId: "w_1",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
} as LightWorkspaceType;

function makeBlockedAction({
  multiSelect = false,
}: {
  multiSelect?: boolean;
} = {}): BlockedToolExecution & {
  status: "blocked_user_answer_required";
} {
  return {
    conversationId: "conv_1",
    messageId: "msg_1",
    actionId: "action_1",
    userId: "user_1",
    configurationId: "config_1",
    created: 1,
    metadata: {
      toolName: "tool",
      mcpServerName: "server",
      agentName: "agent",
    },
    inputs: {},
    status: "blocked_user_answer_required",
    authorizationInfo: null,
    question: {
      question: "Choose an option",
      multiSelect,
      options: [
        {
          label: "Alpha",
          description: "First option",
        },
        {
          label: "Beta",
          description: "Second option",
        },
      ],
    },
  };
}

function getKeyboardContainer(container: HTMLElement) {
  const element = container.querySelector("div[tabindex='0']");

  if (!(element instanceof HTMLDivElement)) {
    throw new Error("Keyboard container not found");
  }

  return element;
}

describe("UserAnswerRequired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answerQuestionMock.mockResolvedValue({ success: true });
  });

  it("highlights the first option by default and moves the highlight with arrow keys", async () => {
    const { container } = render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction()}
        triggeringUser={null}
        owner={owner}
        conversationId="conv_1"
        messageId="msg_1"
      />
    );

    const keyboardContainer = getKeyboardContainer(container);
    const alphaOption = screen.getByRole("button", { name: /Alpha/i });
    const betaOption = screen.getByRole("button", { name: /Beta/i });

    await waitFor(() => expect(keyboardContainer).toHaveFocus());
    expect(alphaOption).toHaveClass("bg-muted-background/60");
    expect(betaOption).not.toHaveClass("bg-muted-background/60");

    fireEvent.keyDown(keyboardContainer, { key: "ArrowDown" });

    expect(betaOption).toHaveClass("bg-muted-background/60");
    expect(alphaOption).not.toHaveClass("bg-muted-background/60");
  });

  it("submits the active option with Enter in single-select mode", async () => {
    const { container } = render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction()}
        triggeringUser={null}
        owner={owner}
        conversationId="conv_1"
        messageId="msg_1"
      />
    );

    const keyboardContainer = getKeyboardContainer(container);

    fireEvent.keyDown(keyboardContainer, { key: "ArrowDown" });
    fireEvent.keyDown(keyboardContainer, { key: "Enter" });

    await waitFor(() => {
      expect(answerQuestionMock).toHaveBeenCalledWith({
        conversationId: "conv_1",
        messageId: "msg_1",
        actionId: "action_1",
        answer: { selectedOptions: [1] },
      });
    });
    expect(removeCompletedActionMock).toHaveBeenCalledWith("action_1");
  });

  it("toggles options with Space and Enter, then submits with Cmd+Enter in multi-select mode", async () => {
    const { container } = render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction({ multiSelect: true })}
        triggeringUser={null}
        owner={owner}
        conversationId="conv_1"
        messageId="msg_1"
      />
    );

    const keyboardContainer = getKeyboardContainer(container);
    const alphaOption = screen.getByRole("button", { name: /Alpha/i });
    const betaOption = screen.getByRole("button", { name: /Beta/i });

    fireEvent.keyDown(keyboardContainer, { key: " " });
    fireEvent.keyDown(keyboardContainer, { key: "ArrowDown" });
    fireEvent.keyDown(keyboardContainer, { key: "Enter" });

    await waitFor(() => {
      expect(alphaOption).toHaveAttribute("data-selected", "true");
      expect(betaOption).toHaveAttribute("data-selected", "true");
    });

    fireEvent.keyDown(keyboardContainer, {
      key: "Enter",
      metaKey: true,
    });

    await waitFor(() => {
      expect(answerQuestionMock).toHaveBeenCalledWith({
        conversationId: "conv_1",
        messageId: "msg_1",
        actionId: "action_1",
        answer: { selectedOptions: [0, 1] },
      });
    });
  });

  it("moves focus into the custom input and types there when a printable key is pressed", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction({ multiSelect: true })}
        triggeringUser={null}
        owner={owner}
        conversationId="conv_1"
        messageId="msg_1"
      />
    );

    const keyboardContainer = getKeyboardContainer(container);
    const customInput = screen.getByPlaceholderText("Type something else");

    await waitFor(() => expect(keyboardContainer).toHaveFocus());

    await user.keyboard("h");

    expect(customInput).toHaveFocus();
    expect(customInput).toHaveValue("h");

    await user.type(customInput, "ello");
    fireEvent.keyDown(customInput, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(answerQuestionMock).toHaveBeenCalledWith({
        conversationId: "conv_1",
        messageId: "msg_1",
        actionId: "action_1",
        answer: {
          selectedOptions: [],
          customResponse: "hello",
        },
      });
    });
  });

  it("submits the current multi-select choices when Cmd+Enter is pressed on a focused option", async () => {
    const user = userEvent.setup();

    render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction({ multiSelect: true })}
        triggeringUser={null}
        owner={owner}
        conversationId="conv_1"
        messageId="msg_1"
      />
    );

    const alphaOption = screen.getByRole("button", { name: /Alpha/i });
    const betaOption = screen.getByRole("button", { name: /Beta/i });

    await user.click(alphaOption);
    await act(async () => {
      betaOption.focus();
    });

    await user.keyboard("{Meta>}{Enter}{/Meta}");

    await waitFor(() => {
      expect(answerQuestionMock).toHaveBeenCalledWith({
        conversationId: "conv_1",
        messageId: "msg_1",
        actionId: "action_1",
        answer: { selectedOptions: [0] },
      });
    });
    expect(betaOption).toHaveAttribute("data-selected", "false");
  });

  it("requires Cmd+Enter from the custom response input in multi-select mode", async () => {
    const user = userEvent.setup();

    render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction({ multiSelect: true })}
        triggeringUser={null}
        owner={owner}
        conversationId="conv_1"
        messageId="msg_1"
      />
    );

    const customInput = screen.getByPlaceholderText("Type something else");

    await user.type(customInput, "Other answer");
    await user.keyboard("{Enter}");

    expect(answerQuestionMock).not.toHaveBeenCalled();

    fireEvent.keyDown(customInput, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(answerQuestionMock).toHaveBeenCalledWith({
        conversationId: "conv_1",
        messageId: "msg_1",
        actionId: "action_1",
        answer: {
          selectedOptions: [],
          customResponse: "Other answer",
        },
      });
    });
  });
});
