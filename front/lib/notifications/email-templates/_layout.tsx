import { Html } from "@react-email/html";
import Head from "next/head";
import React from "react";

export const EmailLayout = ({
  workspace,
  children,
}: {
  workspace: { id: string; name: string };
  children: React.ReactNode;
}) => {
  return (
    <Html>
      <Head>
        <title>An email from Dust about {workspace.name}</title>
      </Head>
      <body
        style={{
          fontFamily: "Open Sans, Helvetica Neue, Helvetica, Arial, sans-serif",
          fontSize: "14px",
          backgroundColor: "#ffffff",
          padding: "20px",
        }}
      >
        <div style={{ width: "100%", textAlign: "left", marginBottom: "30px" }}>
          <a
            href={process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}
            target="_new"
          >
            <img
              alt="Dust Logo"
              style={{ margin: "0 auto", border: "0px" }}
              width={96}
              height={24}
              src="https://dust.tt/static/landing/logos/dust/Dust_Logo.png"
            />
          </a>
        </div>
        <div
          style={{
            maxWidth: "600px",
            backgroundColor: "#ffffff",
          }}
        >
          {children}
        </div>
        <div
          style={{
            width: "100%",
            textAlign: "left",
            marginTop: "20px",
            fontSize: "12px",
            color: "#969CA5",
          }}
        >
          <div>This is an automated email. Please do not reply.</div>
          <div>
            Manage your notifications in{" "}
            <a
              href={`${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/w/${workspace.id}/me`}
              target="_blank"
              style={{ color: "#1C91FF" }}
            >
              your profile settings
            </a>
            .
          </div>
        </div>
      </body>
    </Html>
  );
};
