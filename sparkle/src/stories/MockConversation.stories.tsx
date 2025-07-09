import type { Meta } from "@storybook/react";
import React from "react";

import {
  Avatar,
  Button,
  Citation,
  CitationIcons,
  CitationTitle,
  GithubIcon,
  Icon,
  Markdown,
  SlackLogo,
  TableIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Playground/MockConversation",
} satisfies Meta<typeof ConversationView>;

export default meta;

type MessageType = "user" | "agent";

interface Message {
  type: MessageType;
  content: string;
  name: string;
  pictureUrl: string;
  citations?: React.ReactNode[];
  buttons?: React.ReactNode[];
  isMarkdown?: boolean;
}

interface ConversationViewProps {
  messages: Message[];
}

const ConversationView: React.FC<ConversationViewProps> = ({ messages }) => {
  return (
    <div className="s-flex s-w-full s-max-w-4xl s-flex-1 s-flex-col s-justify-start s-gap-8 s-pb-4 s-@container/conversation">
      {messages.map((message, index) => (
        <div key={index} className="s-flex s-flex-col s-gap-2">
          <div className="s-flex s-items-start s-gap-3">
            <Avatar size="sm" visual={message.pictureUrl} name={message.name} />
            <div className="s-flex-1">
              <div className="s-font-medium">{message.name}</div>
              <div className="s-text-sm s-text-muted-foreground">
                {message.isMarkdown ? (
                  <Markdown content={message.content} />
                ) : (
                  message.content
                )}
              </div>
              {message.citations && (
                <div className="s-mt-2 s-flex s-flex-col s-gap-1">
                  {message.citations}
                </div>
              )}
              {message.buttons && (
                <div className="s-mt-2 s-flex s-gap-2">{message.buttons}</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const WithMarkdownAndCitations = () => {
  const messages: Message[] = [
    {
      type: "user",
      name: "John Doe",
      content: "Can you explain how our authentication system works?",
      pictureUrl: "https://dust.tt/static/droidavatar/Droid_Lime_1.jpg",
    },
    {
      type: "agent",
      name: "@helper",
      content: `
# Authentication System Overview

Our authentication system uses a multi-layered approach:

1. **JWT Tokens** for session management
2. **OAuth2** for third-party integrations
3. **Rate limiting** to prevent abuse

## Key Components

\`\`\`typescript
interface AuthConfig {
  jwtSecret: string;
  expiresIn: string;
  refreshToken: boolean;
}
\`\`\`

The system is designed to be:
- Secure by default
- Easy to integrate
- Scalable

> Note: Always use environment variables for sensitive configuration.
      `,
      pictureUrl: "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
      isMarkdown: true,
      citations: [
        <Citation key="1" href="#">
          <CitationIcons>
            <Icon visual={GithubIcon} size="sm" />
          </CitationIcons>
          <CitationTitle>
            auth/config.ts - Authentication configuration
          </CitationTitle>
        </Citation>,
        <Citation key="2" href="#">
          <CitationIcons>
            <Icon visual={TableIcon} size="sm" />
          </CitationIcons>
          <CitationTitle>Authentication System Documentation</CitationTitle>
        </Citation>,
        <Citation key="3" href="#">
          <CitationIcons>
            <Icon visual={SlackLogo} size="sm" />
          </CitationIcons>
          <CitationTitle>
            Security team discussion on auth implementation
          </CitationTitle>
        </Citation>,
      ],
      buttons: [
        <Button
          key="1"
          size="sm"
          label="View Documentation"
          variant="outline"
        />,
        <Button
          key="2"
          size="sm"
          label="Security Guidelines"
          variant="outline"
        />,
      ],
    },
  ];

  return <ConversationView messages={messages} />;
};
