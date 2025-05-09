import { Div3D, Hover3D } from "@dust-tt/sparkle";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { Grid, H2, P, Strong } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export function FutureSection() {
  return (
    <>
      <Grid>
        <div className="col-span-12">
          <div className="mb-16 lg:mb-0">
            <H2>
              Your own AI agents,
              <br />
              powered by the best models
            </H2>
            <P size="lg" className="text-muted-foreground">
              Integrates with your internal&nbsp;data.
              <br />
              Uses the latest models across all major AI providers.
            </P>
          </div>
        </div>
        <div
          className={classNames(
            "col-span-12",
            "grid grid-cols-1 gap-8",
            "md:grid-cols-2 lg:grid-cols-3"
          )}
        >
          <ImgBlock
            title={<>Your company data continuously in&nbsp;sync</>}
            content={
              <>
                Notion, Slack, GitHub (…) and your&nbsp;own custom integrations
                with the&nbsp;Dust&nbsp;API.
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={20}>
                <img src="/static/landing/connect/cloud1.png" />
              </Div3D>
              <Div3D depth={0} className="absolute top-0">
                <img src="/static/landing/connect/cloud2.png" />
              </Div3D>
              <Div3D depth={-20} className="absolute top-0">
                <img src="/static/landing/connect/cloud3.png" />
              </Div3D>
            </Hover3D>
          </ImgBlock>
          <ImgBlock
            title={<>Switch to the&nbsp;new best model in&nbsp;seconds</>}
            content={
              <>
                Proprietary and&nbsp;open-source models suited
                to&nbsp;your&nbsp;needs:{" "}
                <Strong>OpenAI,&nbsp;Anthropic, Mistral,&nbsp;Llama…</Strong>
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={40}>
                <img src="/static/landing/model/model1.png" />
              </Div3D>
              <Div3D depth={20} className="absolute top-0">
                <img src="/static/landing/model/model2.png" />
              </Div3D>
              <Div3D depth={10} className="absolute top-0 drop-shadow-lg">
                <img src="/static/landing/model/model3.png" />
              </Div3D>
              <Div3D depth={30} className="absolute top-0 drop-shadow-lg">
                <img src="/static/landing/model/model4.png" />
              </Div3D>
            </Hover3D>
          </ImgBlock>
          <ImgBlock
            title={<>Access your AI agents wherever you work</>}
            content={
              <>
                Through our Chrome extension, native integrations, or custom
                workflow automations.
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={-20}>
                <img src="/static/landing/extension/extension1.png" />
              </Div3D>
              <Div3D depth={0} className="absolute top-0">
                <img src="/static/landing/extension/extension2.png" />
              </Div3D>
              <Div3D depth={40} className="absolute top-0">
                <img src="/static/landing/extension/extension3.png" />
              </Div3D>
            </Hover3D>
          </ImgBlock>
        </div>
      </Grid>
    </>
  );
}
