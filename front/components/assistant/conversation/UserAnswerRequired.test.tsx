import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";
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
const retryHandlerMock = vi.fn().mockResolvedValue(undefined);
let shouldReduceMotionMock = false;

vi.mock("framer-motion", async (importOriginal) => {
  const original = await importOriginal<typeof import("framer-motion")>();

  return {
    ...original,
    useReducedMotion: () => shouldReduceMotionMock,
  };
});

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
    type = "option",
    label,
    description,
    selected,
    disableHover,
    className,
    onClick,
    disabled,
    onFocusCapture,
    onMouseEnter,
    value,
    onChange,
    placeholder,
    name,
    id,
    inputRef,
    onFocus,
    onBlur,
    onKeyDown,
  }: {
    type?: "option" | "input";
    label?: string;
    description?: string | null;
    selected?: boolean;
    disableHover?: boolean;
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
    onFocusCapture?: React.FocusEventHandler<HTMLButtonElement>;
    onMouseEnter?: React.MouseEventHandler<HTMLButtonElement>;
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    name?: string;
    id?: string;
    inputRef?: React.Ref<HTMLInputElement>;
    onFocus?: React.FocusEventHandler<HTMLInputElement>;
    onBlur?: React.FocusEventHandler<HTMLInputElement>;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  }) =>
    type === "input" ? (
      <div className={className}>
        <input
          ref={inputRef}
          id={id}
          name={name}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      </div>
    ) : (
      <button
        type="button"
        onClick={onClick}
        onFocusCapture={onFocusCapture}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
        onMouseEnter={onMouseEnter}
        disabled={disabled}
        className={cn(!disableHover && "hover-enabled", className)}
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
  const ArrowUp = () => null;

  return {
    ArrowUp,
    Button,
    Card,
    Counter,
    cn,
    Input,
    OptionCard,
    Spinner,
  };
});

const owner: LightWorkspaceType = {
  id: 1,
  sId: "w_1",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

function makeBlockedAction({
  multiSelect = false,
}: {
  multiSelect?: boolean;
} = {}): AgentLoopBlockedToolExecution & {
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

async function finishExitAnimation(container: HTMLElement) {
  const keyboardContainer = getKeyboardContainer(container);

  await waitFor(() => {
    expect(keyboardContainer).toHaveClass(
      "animate-out",
      "fill-mode-forwards",
      "duration-exit",
      "ease-enter"
    );
  });
  fireEvent.animationEnd(keyboardContainer);
}

describe("UserAnswerRequired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldReduceMotionMock = false;
    answerQuestionMock.mockResolvedValue({ success: true });
  });

  it("highlights the first option by default and moves the highlight with arrow keys", async () => {
    const { container } = render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction()}
        triggeringUser={null}
        owner={owner}
        retryHandler={retryHandlerMock}
      />
    );

    const keyboardContainer = getKeyboardContainer(container);
    const alphaOption = screen.getByRole("button", { name: /Alpha/i });
    const betaOption = screen.getByRole("button", { name: /Beta/i });

    await waitFor(() => expect(keyboardContainer).toHaveFocus());
    expect(alphaOption).toHaveClass("bg-hover");
    expect(betaOption).not.toHaveClass("bg-hover");

    fireEvent.keyDown(keyboardContainer, { key: "ArrowDown" });

    expect(betaOption).toHaveClass("bg-hover");
    expect(alphaOption).not.toHaveClass("bg-hover");
  });

  it("hides the cursor during keyboard navigation and restores it on mouse movement", async () => {
    const { container } = render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction()}
        triggeringUser={null}
        owner={owner}
        retryHandler={retryHandlerMock}
      />
    );

    const keyboardContainer = getKeyboardContainer(container);
    const alphaOption = screen.getByRole("button", { name: /Alpha/i });

    await waitFor(() => expect(keyboardContainer).toHaveFocus());
    expect(keyboardContainer).not.toHaveClass("cursor-none");
    expect(alphaOption).toHaveClass("hover-enabled");

    fireEvent.keyDown(keyboardContainer, { key: "ArrowDown" });

    expect(keyboardContainer).toHaveClass("cursor-none");
    expect(alphaOption).not.toHaveClass("hover-enabled");

    fireEvent.mouseMove(keyboardContainer);

    expect(keyboardContainer).not.toHaveClass("cursor-none");
    expect(alphaOption).toHaveClass("hover-enabled");
  });

  it("submits the active option with Enter in single-select mode", async () => {
    const { container } = render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction()}
        triggeringUser={null}
        owner={owner}
        retryHandler={retryHandlerMock}
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
    await finishExitAnimation(container);
    expect(removeCompletedActionMock).toHaveBeenCalledWith("action_1");
  });

  it("keeps the submission state visible until the agent retry completes", async () => {
    const user = userEvent.setup();
    let resolveRetry = () => {};
    retryHandlerMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        })
    );

    const { container } = render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction()}
        triggeringUser={null}
        owner={owner}
        retryHandler={retryHandlerMock}
      />
    );

    await user.click(screen.getByRole("button", { name: /Alpha/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /Alpha/i })
    ).not.toBeInTheDocument();
    expect(removeCompletedActionMock).not.toHaveBeenCalled();

    await act(async () => resolveRetry());

    await finishExitAnimation(container);
    expect(removeCompletedActionMock).toHaveBeenCalledWith("action_1");
  });

  it("removes immediately after retry when motion is reduced", async () => {
    const user = userEvent.setup();
    let resolveRetry = () => {};
    shouldReduceMotionMock = true;
    retryHandlerMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        })
    );

    render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction()}
        triggeringUser={null}
        owner={owner}
        retryHandler={retryHandlerMock}
      />
    );

    await user.click(screen.getByRole("button", { name: /Alpha/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    await act(async () => resolveRetry());

    expect(removeCompletedActionMock).toHaveBeenCalledWith("action_1");
  });

  it("disables controls and skips when Escape is pressed", async () => {
    let resolveAnswer = (_result: { success: boolean }) => {};
    answerQuestionMock.mockImplementationOnce(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveAnswer = resolve;
        })
    );

    const { container } = render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction()}
        triggeringUser={null}
        owner={owner}
        retryHandler={retryHandlerMock}
      />
    );

    const keyboardContainer = getKeyboardContainer(container);

    await waitFor(() => expect(keyboardContainer).toHaveFocus());
    fireEvent.keyDown(keyboardContainer, { key: "Escape" });

    await waitFor(() => {
      expect(answerQuestionMock).toHaveBeenCalledWith({
        conversationId: "conv_1",
        messageId: "msg_1",
        actionId: "action_1",
        answer: { selectedOptions: [] },
      });
    });

    const status = await screen.findByRole("status");
    const hiddenOption = screen.getByRole("button", {
      name: /Alpha/i,
      hidden: true,
    });

    expect(status).toHaveTextContent("Skipping question");
    expect(status).toHaveClass("duration-exit");
    expect(hiddenOption.parentElement).toHaveClass("duration-exit");
    expect(hiddenOption).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send answer" })).toBeDisabled();

    await act(async () => resolveAnswer({ success: true }));
    await finishExitAnimation(container);
    expect(removeCompletedActionMock).toHaveBeenCalledWith("action_1");
  });

  it("toggles options with Space and Enter, then submits with Cmd+Enter in multi-select mode", async () => {
    const { container } = render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction({ multiSelect: true })}
        triggeringUser={null}
        owner={owner}
        retryHandler={retryHandlerMock}
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
        retryHandler={retryHandlerMock}
      />
    );

    const keyboardContainer = getKeyboardContainer(container);
    const alphaOption = screen.getByRole("button", { name: /Alpha/i });
    const customInput = screen.getByPlaceholderText(
      "Tell the agent what to do differently"
    );

    await waitFor(() => expect(keyboardContainer).toHaveFocus());
    expect(alphaOption).toHaveClass("bg-hover");

    await user.keyboard("h");

    expect(customInput).toHaveFocus();
    expect(customInput).toHaveValue("h");
    expect(alphaOption).not.toHaveClass("bg-hover");

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

  it("clears selected options when the custom input receives focus", async () => {
    const user = userEvent.setup();

    render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction({ multiSelect: true })}
        triggeringUser={null}
        owner={owner}
        retryHandler={retryHandlerMock}
      />
    );

    const alphaOption = screen.getByRole("button", { name: /Alpha/i });
    const customInput = screen.getByPlaceholderText(
      "Tell the agent what to do differently"
    );

    await user.click(alphaOption);
    expect(alphaOption).toHaveAttribute("data-selected", "true");

    await user.click(customInput);
    expect(alphaOption).toHaveAttribute("data-selected", "false");
  });

  it("moves back to the last option when Backspace is pressed on an empty custom input", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction()}
        triggeringUser={null}
        owner={owner}
        retryHandler={retryHandlerMock}
      />
    );

    const keyboardContainer = getKeyboardContainer(container);
    const alphaOption = screen.getByRole("button", { name: /Alpha/i });
    const betaOption = screen.getByRole("button", { name: /Beta/i });
    const customInput = screen.getByPlaceholderText(
      "Tell the agent what to do differently"
    );

    await user.click(customInput);
    expect(customInput).toHaveFocus();

    fireEvent.keyDown(customInput, { key: "Backspace" });

    expect(keyboardContainer).toHaveFocus();
    expect(betaOption).toHaveClass("bg-hover");
    expect(alphaOption).not.toHaveClass("bg-hover");
  });

  it("submits the current multi-select choices when Cmd+Enter is pressed on a focused option", async () => {
    const user = userEvent.setup();

    render(
      <UserAnswerRequired
        blockedAction={makeBlockedAction({ multiSelect: true })}
        triggeringUser={null}
        owner={owner}
        retryHandler={retryHandlerMock}
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
        retryHandler={retryHandlerMock}
      />
    );

    const customInput = screen.getByPlaceholderText(
      "Tell the agent what to do differently"
    );

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
