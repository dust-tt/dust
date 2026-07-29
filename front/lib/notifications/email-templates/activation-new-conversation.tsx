import { EmailLayout } from "@app/lib/notifications/email-templates/_layout";
import { render } from "@react-email/render";
import { z } from "zod";

const ActivationNewConversationEmailTemplatePropsSchema = z.object({
  name: z.string(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  podName: z.string(),
  goal: z.string().nullable(),
  action: z.object({
    label: z.string(),
    url: z.string(),
  }),
});

type ActivationNewConversationEmailTemplateProps = z.infer<
  typeof ActivationNewConversationEmailTemplatePropsSchema
>;

const HOW_IT_WORKS_STEPS = [
  {
    title: "Dust suggests",
    sub: "One idea at a time, drawn from how you actually work. Never a list.",
    emoji: "✨",
    bg: "#EEF2FF",
  },
  {
    title: "You say yes",
    sub: "In the chat, in your own words. Nothing runs without your ok.",
    emoji: "💬",
    bg: "#F5F3FF",
  },
  {
    title: "It runs for you",
    sub: "On a schedule you pick. You don't do anything.",
    emoji: "📅",
    bg: "#E9F7FF",
  },
  {
    title: "Results land in your workspace",
    sub: "Each finished recommendation becomes an easy to find conversation.",
    emoji: "📥",
    bg: "#ECFDF5",
  },
];

const ActivationNewConversationEmailTemplate = ({
  name,
  workspace,
  goal,
  action,
}: ActivationNewConversationEmailTemplateProps) => {
  return (
    <EmailLayout workspace={workspace}>
      {/* Static message about what the activation pod is*/}
      <p
        style={{
          fontSize: "20px",
          fontWeight: 600,
          color: "#111418",
          margin: "0 0 16px 0",
          lineHeight: "1.3",
        }}
      >
        Hi {name}!
        <br />
        <br />
        Introducing your activation experience:
        <br />
        The place where Dust works for you.
      </p>
      {/* this message will be replaced/improved with the help of the marketing team */}
      <p
        style={{
          fontSize: "14px",
          color: "#64707D",
          margin: "0 0 20px 0",
          lineHeight: "1.6",
        }}
      >
        Your conversations, files, and anything you approve to run on its own
        all live here, so nothing you set up is ever lost or hidden. This page
        fills up with things you say yes to, one at a time.
      </p>

      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        border={0}
      >
        <tbody>
          {HOW_IT_WORKS_STEPS.map((step, i) => {
            const last = i === HOW_IT_WORKS_STEPS.length - 1;
            return (
              <tr key={step.title}>
                <td width={40} valign="top">
                  <table
                    role="presentation"
                    cellPadding={0}
                    cellSpacing={0}
                    border={0}
                  >
                    <tbody>
                      <tr>
                        <td
                          width={32}
                          height={32}
                          align="center"
                          valign="middle"
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "16px",
                            backgroundColor: step.bg,
                            fontSize: "14px",
                            lineHeight: "32px",
                            textAlign: "center",
                          }}
                        >
                          {step.emoji}
                        </td>
                      </tr>
                      {!last && (
                        <tr>
                          <td align="center">
                            <div
                              style={{
                                width: "1px",
                                height: "24px",
                                margin: "4px auto",
                                backgroundColor: "#EEEEEF",
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </td>
                <td
                  valign="top"
                  style={{
                    paddingLeft: "16px",
                    paddingBottom: last ? "0" : "20px",
                  }}
                >
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#111418",
                      margin: "0 0 2px 0",
                    }}
                  >
                    {step.title}
                  </p>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#64707D",
                      margin: 0,
                      lineHeight: "1.5",
                    }}
                  >
                    {step.sub}
                  </p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p
        style={{
          fontSize: "15px",
          color: "#111418",
          margin: "16px 0 16px 0",
          lineHeight: "1.5",
        }}
      >
        {/* The goal is a short llm generated description of the recommendation. Falls back to a generic message */}
        {goal
          ? `We put together a simple way to help you ${goal}.`
          : `We put something together to help you get started with Dust.`}
      </p>

      {/* Button into the activation conversation */}
      <p style={{ margin: "0 0 20px 0" }}>
        <a
          href={action.url}
          target="_blank"
          style={{
            display: "inline-block",
            backgroundColor: "#1C91FF",
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 600,
            textDecoration: "none",
            padding: "10px 20px",
            borderRadius: "6px",
          }}
        >
          Start building
        </a>
      </p>
    </EmailLayout>
  );
};

export function renderEmail(args: ActivationNewConversationEmailTemplateProps) {
  return render(<ActivationNewConversationEmailTemplate {...args} />);
}
