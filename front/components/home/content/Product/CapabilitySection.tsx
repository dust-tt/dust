import { Div3D, Hover3D } from "@dust-tt/sparkle";
import React from "react";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { H2, P } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export function CapabilitySection() {
  return (
    <div className="w-full">
      <div className="mb-6">
        <H2 from="from-amber-200" to="to-amber-400">
          Tailor AI assistants to your team needs
        </H2>
        <P size="lg">
          Anyone on your&nbsp;team can create personalized&nbsp;assistants.
        </P>
      </div>

      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 md:gap-24">
        <ImgBlock
          title={<>Switch to the&nbsp;new best model in&nbsp;seconds.</>}
          content={
            <>
              “Choose GPT-4, Anthropic, Gemini, Mistral, or any cutting-edge
              model to ensure your assistants stay smartest.”
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-40}>
              <img src="/static/landing/model/model1.png" />
            </Div3D>
            <Div3D depth={0} className="absolute top-0">
              <img src="/static/landing/model/model2.png" />
            </Div3D>
            <Div3D depth={50} className="absolute top-0 drop-shadow-lg">
              <img src="/static/landing/model/model3.png" />
            </Div3D>
            <Div3D depth={120} className="absolute top-0 drop-shadow-lg">
              <img src="/static/landing/model/model4.png" />
            </Div3D>
          </Hover3D>
        </ImgBlock>

        <ImgBlock
          title={<>Plug into your company context.</>}
          content={
            <>Notion, Slack, GitHub, external websites (…) - in minutes.</>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-20}>
              <img src="/static/landing/connect/connect1.png" />
            </Div3D>
            <Div3D depth={0} className="absolute top-0">
              <img src="/static/landing/connect/connect2.png" />
            </Div3D>
            <Div3D depth={15} className="absolute top-0">
              <img src="/static/landing/connect/connect3.png" />
            </Div3D>
            <Div3D depth={60} className="absolute top-0">
              <img src="/static/landing/connect/connect4.png" />
            </Div3D>
          </Hover3D>
        </ImgBlock>
        <ImgBlock
          title={<>Build for your team, act on feedback</>}
          content={
            <>
              Empower those with a&nbsp;builder mindset to build assistants for
              their teams and get immediate feedback.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-20}>
              <img src="/static/landing/people/people1.png" />
            </Div3D>
            <Div3D depth={0} className="absolute top-0">
              <img src="/static/landing/people/people2.png" />
            </Div3D>
            <Div3D depth={15} className="absolute top-0">
              <img src="/static/landing/people/people3.png" />
            </Div3D>
            <Div3D depth={60} className="absolute top-0">
              <img src="/static/landing/people/people4.png" />
            </Div3D>
            <Div3D depth={90} className="absolute top-0">
              <img src="/static/landing/people/people5.png" />
            </Div3D>
          </Hover3D>
        </ImgBlock>
        <ImgBlock
          title={<>Customize instructions, use pre-built tools</>}
          content={
            <>
              Adapt instructions to your needs, with pre-built templates.
              Empower assistants with specialized tools for data extraction,
              transformations, or advanced operations.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-20}>
              <img src="/static/landing/templates/template1.png" />
            </Div3D>
            <Div3D depth={0} className="absolute top-0">
              <img src="/static/landing/templates/template2.png" />
            </Div3D>
            <Div3D depth={15} className="absolute top-0">
              <img src="/static/landing/templates/template3.png" />
            </Div3D>
            <Div3D depth={40} className="absolute top-0">
              <img src="/static/landing/templates/template4.png" />
            </Div3D>
          </Hover3D>
        </ImgBlock>

        {/* <ImgBlock
          title={
            <>
              Don't change everything; Let AI fit in your existing&nbsp;workflow
            </>
          }
          content={
            <>
              Leverage Dust’s Slack&nbsp;integration, API, and&nbsp;Dust Apps
              to&nbsp;bring Dust where you&nbsp;need&nbsp;it.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-20}>
              <img src="/static/landing/slack/slack1.png" />
            </Div3D>
            <Div3D depth={20} className="absolute top-0">
              <img src="/static/landing/slack/slack2.png" />
            </Div3D>
            <Div3D depth={40} className="absolute top-0">
              <img src="/static/landing/slack/slack3.png" />
            </Div3D>
            <Div3D depth={70} className="absolute top-0">
              <img src="/static/landing/slack/slack4.png" />
            </Div3D>
          </Hover3D>
        </ImgBlock> */}
      </div>
    </div>
  );
}
