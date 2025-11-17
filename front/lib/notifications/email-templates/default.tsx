import { Html } from "@react-email/html";
import { render } from "@react-email/render";
import Head from "next/head";
import * as React from "react";

interface DefaultEmailTemplateProps {
  name: string;
  content: string;
  avatarUrl?: string;
  action?: {
    label: string;
    url: string;
  };
}

const DefaultEmailTemplate = ({
  name,
  content,
  action,
}: DefaultEmailTemplateProps) => {
  return (
    <Html style={{ backgroundColor: "#ffffff" }}>
      <Head>
        <title>An email from Dust</title>
      </Head>
      <body>
        <div style={{ margin: "0 auto", maxWidth: "800px" }}>
          <div style={{ width: "100%", textAlign: "center" }}>
            <img
              alt="Dust Logo"
              style={{ margin: "0 auto" }}
              width={128}
              src="https://dust.tt/static/landing/logos/dust/Dust_Logo.png"
            />
          </div>
          <h1>Hi {name},</h1>
          {content.split("\n").map((line, index) => (
            <div key={index}>{line}</div>
          ))}
          <hr className="border-gray-200" />

          {action && (
            <a href={action.url} target="_blank">
              {action.label}
            </a>
          )}
        </div>
      </body>
    </Html>
  );
};

export function renderEmail(args: DefaultEmailTemplateProps) {
  return render(<DefaultEmailTemplate {...args} />);
}
