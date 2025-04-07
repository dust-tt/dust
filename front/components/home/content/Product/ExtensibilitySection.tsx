import { ImgBlock, ImgContent } from "@app/components/home/ContentBlocks";
import { H2, P } from "@app/components/home/ContentComponents";

export function ExtensibilitySection({ page = "default" }) {
  return (
    <div className="w-full">
      <div className="mb-8">
        <H2>Connect to your systems with APIs</H2>
        <P size="lg" className="text-muted-foreground">
          {page === "default"
            ? "The Dust Developer Platform lets you build custom use cases, integrations, and workflow automations."
            : "Build custom use cases, integrations, and workflow automations with our developer platform."}
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
          <ImgContent
            images={[
              {
                src: "/static/landing/apps/ticketgeneration.png",
                alt: "Custom agentic tools",
              },
            ]}
          />
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
          <ImgContent
            images={[
              {
                src: "/static/landing/api/connections.png",
                alt: "Custom connections",
              },
            ]}
          />
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
          <ImgContent
            images={[
              {
                src: "/static/landing/api/integration.png",
                alt: "Custom integrations",
              },
            ]}
          />
        </ImgBlock>
      </div>
    </div>
  );
}
