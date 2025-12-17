import { Html } from "@react-email/html";
import Head from "next/head";

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
          backgroundColor: "#e9f7ff",
          padding: "20px",
        }}
      >
        <div
          style={{ width: "100%", textAlign: "center", marginBottom: "10px" }}
        >
          <a
            href={process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}
            target="_new"
          >
            <img
              style={{ margin: "0 auto", border: "0px" }}
              width={168}
              height={42}
              src="https://dust.tt/static/landing/logos/dust/Dust_Logo.png"
            />
          </a>
        </div>
        <div
          style={{
            margin: "0 auto",
            maxWidth: "600px",
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            padding: "20px",
          }}
        >
          {children}
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
            <a
              href={`${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/w/${workspace.id}/me`}
              target="_blank"
            >
              Manage your notifications in your profile settings.
            </a>
          </div>
        </div>
      </body>
    </Html>
  );
};
