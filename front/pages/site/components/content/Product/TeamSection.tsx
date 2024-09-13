import { Div3D, Hover3D } from "@dust-tt/sparkle";
import React from "react";

import { Grid, H2, P } from "@app/pages/site/components/ContentComponents";

const defaultFlexClasses = "flex flex-col gap-8";

import { classNames } from "@app/lib/utils";
import { ImgBlock } from "@app/pages/site/components/ContentBlocks";

export function TeamSection() {
  return (
    <>
      <Grid>
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-9 xl:col-start-2",
            "2xl:col-start-3"
          )}
        >
          <H2 from="from-amber-200" to="to-amber-400">
            Keep your&nbsp;team
            <br />
            up&nbsp;to&nbsp;speed
          </H2>
          <P size="lg">
            Anyone on your&nbsp;team can create personalized&nbsp;assistants.
          </P>
        </div>
        <div
          className={classNames(
            "col-span-12",
            "grid grid-cols-1 gap-x-8 gap-y-20",
            "md:grid-cols-2 md:gap-y-28",
            "lg:col-span-10 lg:col-start-2"
          )}
        >
          <ImgBlock
            title={<>Give your&nbsp;creative team members an&nbsp;edge</>}
            content={
              <>
                Empower those with a&nbsp;builder mindset the&nbsp;right tools
                to&nbsp;accelerate your&nbsp;company's transition
                with&nbsp;GenAI.
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
            title={<>Get your team started with&nbsp;templates</>}
            content={
              <>Build upon selected practical examples straight&nbsp;away.</>
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
            title={
              <>Package powerful workflows in easy-to-use&nbsp;assistants</>
            }
            content={
              <>
                Team members easily&nbsp;@mention the&nbsp;assistants
                they&nbsp;need.
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={-40}>
                <img src="/static/landing/sharing/sharing1.png" />
              </Div3D>
              <Div3D depth={0} className="absolute top-0">
                <img src="/static/landing/sharing/sharing2.png" />
              </Div3D>
              <Div3D depth={50} className="absolute top-0 drop-shadow-lg">
                <img src="/static/landing/sharing/sharing3.png" />
              </Div3D>
              <Div3D depth={120} className="absolute top-0 drop-shadow-lg">
                <img src="/static/landing/sharing/sharing4.png" />
              </Div3D>
            </Hover3D>
          </ImgBlock>

          <ImgBlock
            title={
              <>
                Don't change everything; Let AI fit in your
                existing&nbsp;workflow
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
          </ImgBlock>
        </div>
      </Grid>
    </>
  );
}
