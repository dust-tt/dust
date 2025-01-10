import { Div3D, Hover3D } from "@dust-tt/sparkle";
import React from "react";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { H2, P } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export function UseCasesSection() {
  return (
    <div className="w-full">
      <div className="mb-12">
        <H2 from="from-sky-200" to="to-blue-400">
          Top use cases
        </H2>
        {/* <P size="lg">Resolve tickets, train agents, and build knowledge.</P> */}
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-8 sm:gap-x-12 sm:gap-y-12 md:grid-cols-2 md:gap-x-16 md:gap-y-16 lg:gap-x-24">
        {" "}
        <ImgBlock
          title={<>Ticket Resolution</>}
          content={
            <>
              Smart answer suggestions and<br></br> contextual knowledge at your
              fingertips.
            </>
          }
        >
          {" "}
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
        <ImgBlock
          title={<>Agent Coaching</>}
          content={
            <>
              Helps support agents learn best<br></br> practices and company
              knowledge faster.{" "}
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
        <ImgBlock
          title={<>Documentation Builder</>}
          content={
            <>
              Converts resolved support tickets into searchable knowledge base
              articles and FAQ.
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
        <ImgBlock
          title={<>Customer Insights</>}
          content={
            <>
              Turn customer feedback from every <br></br>channel into actionable
              insights.
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
    </div>
  );
}
