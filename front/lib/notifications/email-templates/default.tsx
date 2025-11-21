import { Html } from "@react-email/html";
import { render } from "@react-email/render";
import Head from "next/head";
import * as React from "react";
import { z } from "zod";

export const DefaultEmailTemplatePropsSchema = z.object({
  name: z.string(),
  content: z.string(),
  avatarUrl: z.string().optional(),
  action: z
    .object({
      label: z.string(),
      url: z.string(),
    })
    .optional(),
});

type DefaultEmailTemplateProps = z.infer<
  typeof DefaultEmailTemplatePropsSchema
>;

const DefaultEmailTemplate = ({
  name,
  content,
  action,
}: DefaultEmailTemplateProps) => {
  return (
    <Html style={{ backgroundColor: "#e9f7ff" }}>
      <Head>
        <title>An email from Dust</title>
      </Head>
      <body
        style={{
          fontFamily: "Open Sans, Helvetica Neue, Helvetica, Arial, sans-serif",
          fontSize: "14px",
        }}
      >
        <div
          style={{ width: "100%", textAlign: "center", marginBottom: "20px" }}
        >
          <a
            href={process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}
            target="_new"
          >
            <img
              alt="Dust Logo"
              style={{ margin: "0 auto", border: "0px" }}
              width={192}
              height={48}
              src="https://dust.tt/static/landing/logos/dust/Dust_Logo.png"
            />
          </a>
        </div>
        <div
          style={{
            margin: "0 auto",
            maxWidth: "500px",
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            padding: "20px",
          }}
        >
          <h3>Hi {name},</h3>
          {content.split("\n").map((line, index) => (
            <div key={index}>{line}</div>
          ))}

          {action?.label && action?.url && (
            <>
              <hr style={{ border: "1px solid #e0e0e0" }} />
              <a href={action.url} target="_blank">
                {action.label}
              </a>
            </>
          )}
        </div>
        <div
          style={{
            width: "100%",
            textAlign: "center",
            marginTop: "20px",
            fontSize: "12px",
          }}
        >
          <div>This is an automated email. Please do not reply. </div>
          <div>
            <a href={process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}>
              Manage your notifications in your profile settings.
            </a>
          </div>
        </div>
      </body>
    </Html>
  );
};

export function renderEmail(args: DefaultEmailTemplateProps) {
  return render(<DefaultEmailTemplate {...args} />);
}
