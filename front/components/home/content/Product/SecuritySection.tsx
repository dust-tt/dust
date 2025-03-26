import { Div3D, Hover3D } from "@dust-tt/sparkle";
import Link from "next/link";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { A, Grid, H2, P } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export function SecuritySection() {
  return (
    <>
      <Grid>
        <div className="col-span-12 mb-6">
          <div>
            <H2>Built with enterprise-grade security</H2>
            <P size="lg" className="text-muted-foreground">
              We've made security our core focus from day&nbsp;one to safeguard
              your&nbsp;company&nbsp;data and workspace&nbsp;privacy. Avoid
              shadow IT and benefit from Enterprise-level privacy from model
              providers. SOC2, HIPAA & GDPR compliant.
              <br></br>
              <Link href="/home/security" shallow={true}>
                <A variant="primary">More about Security</A>
              </Link>
            </P>
          </div>
        </div>
        <div
          className={classNames(
            "col-span-12 pt-8",
            "grid grid-cols-1 gap-x-8 gap-y-20",
            "sm:grid-cols-3 md:gap-y-16"
          )}
        >
          <ImgBlock
            title={<>Ingest data on your terms</>}
            content={
              <>
                Control data selection and hosting location within rigorous
                security parameters.
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={-20}>
                <img src="/static/landing/selection/selection1.png" />
              </Div3D>
              <Div3D depth={0} className="absolute top-0">
                <img src="/static/landing/selection/selection2.png" />
              </Div3D>
              <Div3D depth={15} className="absolute top-0">
                <img src="/static/landing/selection/selection3.png" />
              </Div3D>
              <Div3D depth={60} className="absolute top-0">
                <img src="/static/landing/selection/selection4.png" />
              </Div3D>
            </Hover3D>
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
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={-20}>
                <img src="/static/landing/provider/provider1.png" />
              </Div3D>
              <Div3D depth={20} className="absolute top-0">
                <img src="/static/landing/provider/provider2.png" />
              </Div3D>
              <Div3D depth={40} className="absolute top-0">
                <img src="/static/landing/provider/provider3.png" />
              </Div3D>
              <Div3D depth={70} className="absolute top-0">
                <img src="/static/landing/provider/provider4.png" />
              </Div3D>
            </Hover3D>
          </ImgBlock>
          <ImgBlock
            title={<>Maintain rigorous access control</>}
            content={
              <>
                Tailor Dust's features to each user according to specified
                access rights.
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
              <Div3D depth={0} className="absolute top-0">
                <img src="/static/landing/member/member2.png" />
              </Div3D>
              <Div3D depth={15} className="absolute top-0">
                <img src="/static/landing/member/member3.png" />
              </Div3D>
              <Div3D depth={60} className="absolute top-0">
                <img src="/static/landing/member/member4.png" />
              </Div3D>
            </Hover3D>
          </ImgBlock>
        </div>
      </Grid>
    </>
  );
}
