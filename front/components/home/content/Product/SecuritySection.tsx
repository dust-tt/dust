import { ImgBlock, ImgContent } from "@app/components/home/ContentBlocks";
import { H2, P } from "@app/components/home/ContentComponents";

export function SecuritySection() {
  return (
    <div className="w-full">
      <div className="mb-8">
        <H2>Enterprise-grade security</H2>
        <P size="lg" className="text-muted-foreground">
          Dust's platform upholds the highest standards of data privacy and
          security, ensuring complete control over how and where your data is
          used.
        </P>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <ImgBlock
          title={<>Ingest data on your terms</>}
          content={
            <>
              Control data selection and hosting location within rigorous
              security parameters.
            </>
          }
        >
          <ImgContent
            images={[
              { src: "/static/landing/selection/selection1.png" },
              { src: "/static/landing/selection/selection2.png" },
              { src: "/static/landing/selection/selection3.png" },
              { src: "/static/landing/selection/selection4.png" },
            ]}
          />
        </ImgBlock>
        <ImgBlock
          title={<>Select trusted models only</>}
          content={
            <>
              Pick from trusted providers with zero data retention nor model
              training.
            </>
          }
        >
          <ImgContent
            images={[
              { src: "/static/landing/provider/provider1.png" },
              { src: "/static/landing/provider/provider2.png" },
              { src: "/static/landing/provider/provider3.png" },
              { src: "/static/landing/provider/provider4.png" },
            ]}
          />
        </ImgBlock>
        <ImgBlock
          title={<>Maintain rigorous access control</>}
          content={
            <>
              Tailor Dust's features to each user according to specified access
              rights.
            </>
          }
        >
          <ImgContent
            images={[
              { src: "/static/landing/member/member1.png" },
              { src: "/static/landing/member/member2.png" },
              { src: "/static/landing/member/member3.png" },
              { src: "/static/landing/member/member4.png" },
            ]}
          />
        </ImgBlock>
      </div>
    </div>
  );
}
