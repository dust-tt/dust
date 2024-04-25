import { Div3D, Hover3D } from "@dust-tt/sparkle";
import Link from "next/link";
import React from "react";

import { ImgBlock } from "@app/components/home/new/ContentBlocks";
import {
  A,
  Grid,
  H2,
  P,
  Strong,
} from "@app/components/home/new/ContentComponents";
import { classNames } from "@app/lib/utils";

export function FutureSection() {
  return (
    <>
      <Grid>
        <div
          className={classNames(
            "col-span-12 flex flex-col gap-8",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-8 xl:col-start-2",
            "2xl:col-start-3"
          )}
        >
          <H2 from="from-sky-200" to="to-blue-400">
            Future-Proof
            <br />
            your AI&nbsp;Strategy
          </H2>
          <P size="lg">
            Continuously&nbsp;evolving to&nbsp;meet
            your&nbsp;changing&nbsp;needs, Dust&nbsp;offers access to{" "}
            the&nbsp;market's leading&nbsp;models and support for&nbsp;multiple
            sources of&nbsp;data.
          </P>
        </div>
        <div
          className={classNames(
            "col-span-12",
            "grid grid-cols-1 gap-x-8 gap-y-20",
            "md:grid-cols-3 md:gap-y-16",
            "2xl:col-span-10 2xl:col-start-2"
          )}
        >
          <ImgBlock
            title={<>Your own knowledge base continuously in&nbsp;sync.</>}
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
            title={<>Switch to the&nbsp;new best model in&nbsp;seconds.</>}
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
                Developer- and tinkerer-friendly&nbsp;platform designed
                to&nbsp;build custom actions and&nbsp;application orchestration
                to&nbsp;fit your team’s&nbsp;exact&nbsp;needs.{" "}
                <Link href="/solutions/dust-platform" shallow={true}>
                  <A variant="primary">More about Dust's&nbsp;Platform</A>
                </Link>
                .
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
        </div>
      </Grid>
    </>
  );
}
