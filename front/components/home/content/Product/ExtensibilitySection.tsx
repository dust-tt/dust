import { Div3D, Hover3D } from "@dust-tt/sparkle";
import Link from "next/link";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { A, H2, P } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export function ExtensibilitySection({ page = "default" }) {
  return (
    <div className="w-full">
      <div className="mb-8">
        <H2>Push further with custom code</H2>
        <P size="lg" className="max-w-[700px] text-muted-foreground">
          Developer friendly&nbsp;platform designed to&nbsp;build custom actions
          and&nbsp;application orchestration to&nbsp;fit your
          team’s&nbsp;exact&nbsp;needs.
          <br />{" "}
          {page == "default" && (
            <Link href="/home/solutions/dust-platform" shallow={true}>
              <A variant="primary">More about Dust’s&nbsp;Developer Platform</A>
            </Link>
          )}
          {page != "default" && (
            <Link
              href="https://docs.dust.tt/reference/developer-platform-overview"
              shallow={true}
              target="_blank"
            >
              <A variant="primary">See our documentation</A>
            </Link>
          )}
        </P>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <ImgBlock
          title={<>Build custom agentic tools</>}
          content={
            <>
              Develop advanced or agentic capabilities, from document
              auto-updates, triggered actions, or leveraging external APIs.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative flex items-center justify-center")}
          >
            <Div3D depth={-40}>
              <img
                src="/static/landing/apps/ticketgeneration.png"
                alt="Custom agentic tools"
                className="h-auto max-h-full w-auto max-w-full object-contain"
              />
            </Div3D>
          </Hover3D>
        </ImgBlock>
        <ImgBlock
          title={<>Build custom connections</>}
          content={
            <>
              No ceiling on data connections. Leverage the API to import in
              knowledge from any source and let agents tackle more ambitious use
              cases.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative flex items-center justify-center")}
          >
            <Div3D depth={-40}>
              <img
                src="/static/landing/api/connections.png"
                alt="Custom connections"
                className="h-auto max-h-full w-auto max-w-full object-contain"
              />
            </Div3D>
          </Hover3D>
        </ImgBlock>
        <ImgBlock
          title={<>Build custom integrations</>}
          content={
            <>
              Use our API to embed agents in your apps or websites, unlocking
              fully custom user experiences and deep automation.
            </>
          }
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className={classNames("relative flex items-center justify-center")}
          >
            <Div3D depth={-40}>
              <img
                src="/static/landing/api/integration.png"
                alt="Custom integrations"
                className="h-auto max-h-full w-auto max-w-full object-contain"
              />
            </Div3D>
          </Hover3D>
        </ImgBlock>
      </div>
    </div>
  );
}
