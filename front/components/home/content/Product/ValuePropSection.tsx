import { Div3D, Hover3D } from "@dust-tt/sparkle";
import React from "react";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { classNames } from "@app/lib/utils";

export function ValuePropSection() {
  return (
    <div className="w-full">
      {/* <div className="mb-6">
        <H2 from="from-amber-200" to="to-amber-400">
          Tailor AI assistants to your team needs
        </H2>
        <P size="lg">
          Anyone on your&nbsp;team can create personalized&nbsp;assistants.
        </P>
      </div> */}

      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 md:gap-24">
        <ImgBlock
          title={<>Automate knowledge work</>}
          content={
            <>
              Stop wasting time on data entry, CRM updates, or filling out
              questionnaires. Teach Dust your workflow—and watch it handle
              repetitive tasks for you.
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
          title={<>Surface critical information</>}
          content={
            <>
              Dust reads faster than you. Enjoy effortless summarization,
              targeted extractions, and crisp insights from docs, tickets, chat
              logs—whatever is relevant.
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
          title={<>Analyze & visualize anything</>}
          content={
            <>
              From spreadsheets to data warehouses. Your questions are turned
              into SQL queries, charts, pivots, or deep dives, in seconds.
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
          title={<>Create with confidence</>}
          content={
            <>
              Co-edit with AI that has full context of your internal knowledge
              base, so you never waste time hunting for data or rewriting
              outdated content.
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
      </div>
    </div>
  );
}
