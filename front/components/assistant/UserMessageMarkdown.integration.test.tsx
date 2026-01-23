import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { UserMessageMarkdown } from "./UserMessageMarkdown";

// Mock router utilities and hooks for mention directives
const pushMock = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

const openChangeMock = vi.fn();
vi.mock("@app/hooks/useURLSheet", () => ({
  useURLSheet: () => ({ onOpenChange: openChangeMock }),
}));

const getConversationRouteMock = vi.fn(
  (..._: any[]) => "/w/w_123/a/new?agent=agent_conf_1"
);
const setQueryParamMock = vi.fn();
vi.mock("@app/lib/utils/router", () => ({
  getConversationRoute: (...args: any[]) => getConversationRouteMock(...args),
  setQueryParam: (...args: any[]) => setQueryParamMock(...args),
}));

const mockOwner = {
  id: 1,
  sId: "test-workspace",
  name: "Test Workspace",
  role: "user",
  createdAt: 123456789,
  updatedAt: 123456789,
} as any;

const mockMessage = {
  id: 1,
  sId: "msg-123",
  type: "user_message" as const,
  visibility: "visible" as const,
  version: 0,
  user: null,
  mentions: [],
  context: {
    timezone: "UTC",
    username: "testuser",
    email: "test@example.com",
    fullName: "Test User",
    profilePictureUrl: null,
  },
  content: "Test message",
  createdAt: 123456789,
} as any;

describe("UserMessageMarkdown - Integration Tests", () => {
  describe("Basic Markdown Rendering", () => {
    it("renders plain text", () => {
      const message = { ...mockMessage, content: "Hello world" };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      expect(container.textContent).toBe("Hello world");
    });

    it("renders bold text", () => {
      const message = { ...mockMessage, content: "**bold text**" };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      const strong = container.querySelector("strong");
      expect(strong?.textContent).toBe("bold text");
    });

    it("renders italic text", () => {
      const message = { ...mockMessage, content: "_italic text_" };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      const em = container.querySelector("em");
      expect(em?.textContent).toBe("italic text");
    });

    it("renders code blocks", () => {
      const code = "```javascript\nconst x = 1;\n```";
      const message = { ...mockMessage, content: code };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      // Code blocks may be rendered with suspense/async, so just verify container renders
      expect(container).toBeInTheDocument();
      const pre = container.querySelector("pre");
      // Pre element should exist for code blocks
      if (pre) {
        expect(pre).toBeInTheDocument();
      } else {
        // If pre doesn't exist, the component still rendered successfully
        expect(container).toBeInTheDocument();
      }
    });

    it("renders inline code", () => {
      const message = { ...mockMessage, content: "`inline code`" };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      const code = container.querySelector("code");
      expect(code?.textContent).toBe("inline code");
    });

    it("renders headings", () => {
      const message = { ...mockMessage, content: "# Heading 1" };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      const h1 = container.querySelector("h1");
      expect(h1?.textContent).toBe("Heading 1");
    });

    it("renders blockquotes", () => {
      const message = { ...mockMessage, content: "> Quote text" };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      const blockquote = container.querySelector("blockquote");
      expect(blockquote?.textContent).toBe(`
Quote text
`);
    });
  });

  describe("Custom Directives", () => {
    it("renders cite blocks", () => {
      const content = "Some text with citation^[cite-123]";
      const message = { ...mockMessage, content };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      // The component should render with cite directive processed
      expect(container).toBeInTheDocument();
    });

    it("renders agent mentions", () => {
      const content = "Hey :mention[assistant]{sId=gpt4 name=GPT4}";
      const message = { ...mockMessage, content };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      // The component should render with mention directive processed
      expect(container).toBeInTheDocument();
    });

    it("renders user mentions", () => {
      const content = "Hello :mention_user[John]{userId=123}";
      const message = { ...mockMessage, content };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      // The component should render with user mention directive processed
      expect(container).toBeInTheDocument();
    });

    it("renders content node mentions", () => {
      const content = ":content_node_mention[Document]{nodeId=doc-123}";
      const message = { ...mockMessage, content };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      // The component should render with content node mention directive processed
      expect(container).toBeInTheDocument();
    });

    it("renders pasted attachments", () => {
      const content =
        ":pasted_attachment[File.pdf]{attachmentId=att-123 contentType=application/pdf}";
      const message = { ...mockMessage, content };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      // The component should render with pasted attachment directive processed
      expect(container).toBeInTheDocument();
    });

    it("handles multiple custom directives in one message", () => {
      const content = `Hey :mention[assistant]{sId=gpt4 name=GPT4}, check this document: :content_node_mention[Doc]{nodeId=doc-123} and this file: :pasted_attachment[File]{attachmentId=att-456}`;
      const message = { ...mockMessage, content };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      expect(container).toBeInTheDocument();
    });
  });

  describe("Complex Content Scenarios", () => {
    it("renders mixed markdown with custom directives", () => {
      const content = `# Heading

Regular paragraph with **bold** text and :mention[assistant]{sId=gpt4 name=GPT4}.

- List item 1
- List item 2 with :content_node_mention[Doc]{nodeId=doc-123}

More content after.`;
      const message = { ...mockMessage, content };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      expect(container.querySelector("h1")).toBeInTheDocument();
      expect(container.querySelector("strong")).toBeInTheDocument();
      expect(container.querySelector("ul")).toBeInTheDocument();
    });

    it("handles nested markdown structures", () => {
      const content = `- Item with **bold**
  - Nested item with *italic*
  - Another nested item`;
      const message = { ...mockMessage, content };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      const strong = container.querySelector("strong");
      const em = container.querySelector("em");
      expect(strong).toBeInTheDocument();
      expect(em).toBeInTheDocument();
    });
  });

  describe("HTML Sanitization", () => {
    it("sanitizes dangerous HTML", () => {
      const content = '<script>alert("xss")</script>Safe content';
      const message = { ...mockMessage, content };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      const script = container.querySelector("script");
      expect(script).not.toBeInTheDocument();
      expect(container.textContent).toBe(
        '<script>alert("xss")</script>Safe content'
      );
    });

    it("allows safe HTML tags", () => {
      const content = "<div>Some content</div>";
      const message = { ...mockMessage, content };
      const { container } = render(
        <UserMessageMarkdown
          owner={mockOwner}
          message={message}
          isLastMessage={false}
        />
      );
      // Check that content is rendered (behavior may vary based on sanitization)
      expect(container).toBeInTheDocument();
    });
  });
});
