import { Div3D, Hover3D } from "@dust-tt/sparkle";
import React from "react";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { classNames } from "@app/lib/utils";

import { H2 } from "../../ContentComponents";

export function ValuePropSection() {
  return (
    <div className="w-full">
      <div className="mb-6">
        <H2 from="from-amber-200" to="to-amber-400">
          Unlock your team’s performance with new capabilities
        </H2>
        {/* <P size="lg">
          Anyone on your&nbsp;team can create personalized&nbsp;assistants.
        </P> */}
      </div>

      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 md:gap-24">
        <ImgBlock
          title={<>Analyse anything</>}
          content={
            <>
              From spreadsheets to enterprise warehouses, Dust analyzes any
              dataset to reveal patterns and make faster decisions. Choose your
              perfect visualization charts, graphs, or pivots to spot patterns
              instantly.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-40}>
              <img src="/static/landing/analysis/analysis1.png" />
            </Div3D>
            <Div3D depth={0} className="absolute top-0">
              <img src="/static/landing/analysis/analysis2.png" />
            </Div3D>
            <Div3D depth={15} className="absolute top-0">
              <img src="/static/landing/analysis/analysis3.png" />
            </Div3D>
          </Hover3D>
        </ImgBlock>
        <ImgBlock
          title={<>Automate work beyond limits</>}
          content={
            <>
              Breeze through your day and save time by automating repetitive
              tasks. From data entry to CRM updates, AI assistants handle the
              tedious work while you focus on driving impact.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-40}>
              <img src="/static/landing/crm/crm1.png" />
            </Div3D>
            <Div3D depth={0} className="absolute top-0">
              <img src="/static/landing/crm/crm2.png" />
            </Div3D>
          </Hover3D>
        </ImgBlock>

        <ImgBlock
          title={<>Answer any question, instantly</>}
          content={
            <>
              Get the right information at the right moment. Dust instantly
              searches and synthesizes information from Slack, Notion, Google
              Drive, and all your favourite tools. Enjoy effortless
              summarization, targeted extractions, and crisp insights from docs,
              tickets, chat logs, whatever is relevant.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-40}>
              <img src="/static/landing/docexpert/docexpert1.png" />
            </Div3D>
            <Div3D depth={0} className="absolute top-0">
              <img src="/static/landing/docexpert/docexpert2.png" />
            </Div3D>
          </Hover3D>
        </ImgBlock>
        <ImgBlock
          title={<>Unlock any skills</>}
          content={
            <>
              Go from marketer to coder in a single step, Dust AI agents cover
              the skills you don’t have so you can focus on the vision.
              Transform your ideas into reality, build anything, your
              imagination is the only limit.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative")}
          >
            <Div3D depth={-40}>
              <img src="/static/landing/code/code1.png" />
            </Div3D>
            <Div3D depth={0} className="absolute top-0">
              <img src="/static/landing/code/code2.png" />
            </Div3D>
          </Hover3D>
        </ImgBlock>
      </div>
    </div>
  );
}
