import { Div3D, Hover3D } from "@dust-tt/sparkle";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { Grid, H2, P, Strong } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export function FutureSection() {
  return (
    <>
      <Grid>
        <div className="col-span-12 mb-6">
          <div>
            <H2>
              Your own AI agents,
              <br />
              powered by the best models
            </H2>
            <P size="lg" className="text-gray-600">
              Integrates with your internal&nbsp;data.
              <br />
              Uses the latest models across all major AI providers.
            </P>
          </div>
        </div>
        <div
          className={classNames(
            "col-span-12 pt-8",
            "grid grid-cols-1 gap-x-8 gap-y-20",
            "md:grid-cols-3 md:gap-y-16"
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
            <img src="/static/landing/connect/cloud1.png" />
            <img src="/static/landing/connect/cloud2.png" />
            <img src="/static/landing/connect/cloud3.png" />
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
            <img src="/static/landing/model/model1.png" />
            <img src="/static/landing/model/model2.png" />
            <img src="/static/landing/model/model3.png" />
            <img src="/static/landing/model/model4.png" />
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
            <img src="/static/landing/extension/extension1.png" />
            <img src="/static/landing/extension/extension2.png" />
            <img src="/static/landing/extension/extension3.png" />
          </ImgBlock>
        </div>
      </Grid>
    </>
  );
}
