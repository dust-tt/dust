import {
  AnthropicWhiteLogo,
  Div3D,
  DriveLogo,
  GithubLogo,
  GoogleLogo,
  Hover3D,
  MicrosoftLogo,
  MistralLogo,
  MoreIcon,
  NotionLogo,
  OpenaiWhiteLogo,
  SalesforceLogo,
  SlackLogo,
} from "@dust-tt/sparkle";
import React from "react";

import {
  Grid,
  H2,
  P,
  ReactiveIcon,
  Strong,
} from "@app/components/home/contentComponents";

const defaultFlexClasses = "flex flex-col gap-4";

import { ImgBlock } from "@app/components/home/contentBlocks";
import { classNames } from "@app/lib/utils";

export function ArtSection() {
  return (
    <>
      <Grid>
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-10 xl:col-start-2"
          )}
        >
          <H2 className="text-pink-500">
            Future-Proof your AI&nbsp;Strategy
            <br />
            <span className="text-pink-200">
              with a Model-Agnostic, modular&nbsp;solution.
            </span>
          </H2>
          <P size="lg">
            <Strong>
              Dust is&nbsp; exceptionally modular and&nbsp;adaptable,
            </Strong>
            <br />
            tailoring to&nbsp;your unique requirements.
          </P>
          <P size="lg">
            Continuously&nbsp;evolving to&nbsp;meet
            your&nbsp;changing&nbsp;needs, Dust offers access the&nbsp;market's
            leading&nbsp;models, support of&nbsp;multiple sources of&nbsp;data.
          </P>
        </div>
        <ImgBlock
          title={<>Your own knowledge base continuously in&nbsp;sync.</>}
          content={
            <>
              Notion, Slack, GitHub, Google&nbsp;Drive, Intercom, Confluence
              and&nbsp;more…
            </>
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
          title={<>Switch to the&nbsp;new best model any&nbsp;seconds.</>}
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
          title={<>A modular, extensible&nbsp;platform.</>}
          content={
            <>
              <Strong>Developers and tinkerers friendly&nbsp;platform</Strong>{" "}
              to&nbsp;build custom actions and&nbsp;application orchestration
              to&nbsp;fit your team’s&nbsp;exact&nbsp;needs.
            </>
          }
        >
          <div
            className={classNames(
              "flex w-full flex-wrap gap-4",
              "sm:col-span-5 sm:col-start-2",
              "lg:col-span-4 lg:col-start-4",
              "xl:col-span-3 xl:col-start-4 xl:pl-0",
              "2xl:col-start-5 2xl:pl-6"
            )}
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={-20}>
                <img src="/static/landing/apps/apps1.png" />
              </Div3D>
              <Div3D depth={0} className="absolute top-0">
                <img src="/static/landing/apps/apps2.png" />
              </Div3D>
              <Div3D depth={15} className="absolute top-0">
                <img src="/static/landing/apps/apps3.png" />
              </Div3D>
              <Div3D depth={60} className="absolute top-0">
                <img src="/static/landing/apps/apps4.png" />
              </Div3D>
            </Hover3D>
          </div>
        </ImgBlock>
      </Grid>
    </>
  );
}
