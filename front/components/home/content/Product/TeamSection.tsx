import { Div3D, Hover3D } from "@dust-tt/sparkle";
import React from "react";

import {
  Grid,
  H2,
  P,
  Strong,
} from "@app/components/home/new/ContentComponents";

const defaultFlexClasses = "flex flex-col gap-8";

import { ImgBlock } from "@app/components/home/new/ContentBlocks";
import { classNames } from "@app/lib/utils";

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
            Bring your&nbsp;team
            <br />
            up&nbsp;to&nbsp;speed
          </H2>
          <P size="lg">
            Adopting AI is a&nbsp;fundamental shift for&nbsp;your
            team’s&nbsp;workflows.
            <br />
            <Strong>Spread good&nbsp;practices and AI&nbsp;knowledge.</Strong>
          </P>
        </div>
        <div
          className={classNames(
            "col-span-12",
            "grid grid-cols-1 gap-x-8 gap-y-20",
            "md:grid-cols-2 md:gap-y-28",
            "lg:grid-cols-3",
            "2xl:col-span-10 2xl:col-start-2"
          )}
        >
          <ImgBlock
            title={
              <>Identify your most creative and driven team&nbsp;members.</>
            }
            content={
              <>
                Develop your people's skills and encourage sharing in
                the&nbsp;company.
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
            title={<>Ramp up your team with&nbsp;templates.</>}
            content={
              <>
                Practical examples to&nbsp;apply directly
                and&nbsp;learn&nbsp;from.
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
            title={
              <>Package powerful workflow in easy-to-use&nbsp;assistants.</>
            }
            content={
              <>
                <Strong>
                  <span className="text-emerald-400">@mentions</span>
                </Strong>{" "}
                assistants in&nbsp;discussions, or&nbsp;use assistants directy
                Slack.
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={-20}>
                <img src="/static/landing/builder/builder1.png" />
              </Div3D>
              <Div3D depth={0} className="absolute top-0">
                <img src="/static/landing/builder/builder2.png" />
              </Div3D>
              <Div3D depth={30} className="absolute top-0">
                <img src="/static/landing/builder/builder3.png" />
              </Div3D>
              <Div3D depth={50} className="absolute top-0">
                <img src="/static/landing/builder/builder4.png" />
              </Div3D>
            </Hover3D>
          </ImgBlock>

          <ImgBlock
            title={<>Easily share assistants across your&nbsp;team.</>}
            content={
              <>Spread assistants using Dust's company-wide sharing features.</>
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
            title={<>Manage workspace invitations&nbsp;seamlessly.</>}
            content={
              <>
                Control your workspace with Single Sign-On (SSO) and easy
                batch&nbsp;invites.
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={-20}>
                <img src="/static/landing/member/member1.png" />
              </Div3D>
              <Div3D depth={20} className="absolute top-0">
                <img src="/static/landing/member/member2.png" />
              </Div3D>
              <Div3D depth={40} className="absolute top-0">
                <img src="/static/landing/member/member3.png" />
              </Div3D>
              <Div3D depth={70} className="absolute top-0">
                <img src="/static/landing/member/member4.png" />
              </Div3D>
            </Hover3D>
          </ImgBlock>

          <ImgBlock
            title={
              <>
                Don't change everything; Let AI fit in your
                existing&nbsp;workflow.
              </>
            }
            content={
              <>Use Slack integration, Dust's&nbsp;API, and Dust&nbsp;Apps.</>
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
