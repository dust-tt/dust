import { Div3D, Hover3D } from "@dust-tt/sparkle";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { H2, P } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export function UbiquitySection() {
  return (
    <div className="w-full">
      <div className="mb-8">
        <H2>Have AI wherever you work</H2>
        <P size="lg" className="text-muted-foreground">
          Leverage the power of AI and your knoweldge right where you need it.
          <br />
          No back and forth across tools.
        </P>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <ImgBlock
          title={<>Use in your browser</>}
          content={
            <>
              Access Dust wherever you work via our Chrome extension—no
              app-switching required.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-20}>
              <img
                src="/static/landing/extension/extension1.png"
                alt="Extension visual 1"
              />
            </Div3D>
            <Div3D depth={0} className="absolute top-0">
              <img
                src="/static/landing/extension/extension2.png"
                alt="Extension visual 2"
              />
            </Div3D>
            <Div3D depth={15} className="absolute top-0">
              <img
                src="/static/landing/extension/extension3.png"
                alt="Extension visual 3"
              />
            </Div3D>
          </Hover3D>
        </ImgBlock>
        <ImgBlock
          title={<>Access from your tools</>}
          content={
            <>
              Bring Dust's to Slack&nbsp;, Zendesk and others to&nbsp;bring Dust
              where you&nbsp;need&nbsp;it.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-20}>
              <img
                src="/static/landing/slack/slack1.png"
                alt="Slack visual 1"
              />
            </Div3D>
            <Div3D depth={20} className="absolute top-0">
              <img
                src="/static/landing/slack/slack2.png"
                alt="Slack visual 2"
              />
            </Div3D>
            <Div3D depth={40} className="absolute top-0">
              <img
                src="/static/landing/slack/slack3.png"
                alt="Slack visual 3"
              />
            </Div3D>
            <Div3D depth={70} className="absolute top-0">
              <img
                src="/static/landing/slack/slack4.png"
                alt="Slack visual 4"
              />
            </Div3D>
          </Hover3D>
        </ImgBlock>
        <ImgBlock
          title={<>Add to workflows</>}
          content={
            <>
              Trigger AI actions via Zapier, Make, n8n or Slack workflows to
              automate tasks end-to-end.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-40}>
              <img
                src="/static/landing/zapier/zapier.png"
                alt="Zapier integration"
              />
            </Div3D>
          </Hover3D>
        </ImgBlock>
      </div>
    </div>
  );
}
