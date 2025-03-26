import { Div3D, Hover3D } from "@dust-tt/sparkle";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { H2, P } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export function CapabilitySection() {
  return (
    <div className="w-full">
      <div className="mb-6">
        <H2>
          Tailor AI agents
          <br />
          to your team needs
        </H2>
        <P size="lg" className="text-muted-foreground">
          Anyone on your&nbsp;team can create personalized&nbsp;agents.
        </P>
      </div>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <ImgBlock
          title={<>Build agents with custom instructions and tools</>}
          content={
            <>
              Adapt instructions to your needs, with pre-built templates.
              Empower agents with specialized tools for data extraction,
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
        <ImgBlock
          title={<>Feed your company context</>}
          content={
            <>
              Notion, Slack, GitHub, external websites (…) natively in minutes.
              Integrate anything via API.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-20}>
              <img src="/static/landing/connect/cloud1.png" />
            </Div3D>
            <Div3D depth={0} className="absolute top-0">
              <img src="/static/landing/connect/cloud2.png" />
            </Div3D>
            <Div3D depth={60} className="absolute top-0">
              <img src="/static/landing/connect/cloud3.png" />
            </Div3D>
          </Hover3D>
        </ImgBlock>
        <ImgBlock
          title={<>Leverage the best models on the market.</>}
          content={
            <>
              "Choose OpenAI, Anthropic, Gemini, Mistral, or any cutting-edge
              model to ensure your agents stay smartest."
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
          title={<>Share with your team, collect feedback</>}
          content={
            <>
              Empower tinkerers to build agents for their teams and get
              continuous feedback to iterate on them.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-20}>
              <img src="/static/landing/feedback/feedback.png" />
            </Div3D>
          </Hover3D>
        </ImgBlock>
      </div>
    </div>
  );
}
