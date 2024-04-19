import { Button, Div3D, Hover3D } from "@dust-tt/sparkle";
import type { ReactElement } from "react";

import { HeaderContentBlock } from "@app/components/home/new/ContentBlocks";
import { Grid, H3, P } from "@app/components/home/new/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/new/LandingLayout";
import LandingLayout from "@app/components/home/new/LandingLayout";
import config from "@app/lib/api/config";
import { getSession } from "@app/lib/auth";
import {
  getUserFromSession,
  makeGetServerSidePropsRequirementsWrapper,
} from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  gaTrackingId: string;
  shape: number;
}>(async (context) => {
  // Fetch session explicitly as this page redirects logged in users to our home page.
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  if (user && user.workspaces.length > 0) {
    let url = `/w/${user.workspaces[0].sId}`;

    if (context.query.inviteToken) {
      url = `/api/login?inviteToken=${context.query.inviteToken}`;
    }

    return {
      redirect: {
        destination: url,
        permanent: false,
      },
    };
  }

  return {
    props: { gaTrackingId: config.getGaTrackingId(), shape: 1 },
  };
});

const defaultFlexClasses = "flex flex-col gap-4";

export default function RecruitingPeople() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust Apps, Dust API"
        title={<>Ever&nbsp;expending; Developper and tinkerer&nbsp;friendly</>}
        from="from-amber-200"
        to="to-amber-400"
        subtitle={
          <>
            Build custom actions and application orchestration to&nbsp;fit your
            team’s exact&nbsp;needs.
            <br />
            <a href="https://docs.dust.tt" target="_blank">
              <Button
                variant="primary"
                label="Read the Documentation"
                size="md"
                className="mt-8"
              />
            </a>
          </>
        }
      />
      <Grid>
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "sm:col-span-10 sm:col-start-2",
            "md:col-span-6",
            "xl:col-span-5 xl:col-start-2"
          )}
        >
          <div className="max-w-[360px]">
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
          <H3 className="text-white">
            Dust Apps:
            <br />
            Expends your Assistants&nbsp;agency
          </H3>
          <P size="md">
            Dust Apps are specialized applications designed to perform specific
            tasks by calling models, APIs, or Data Sources.
          </P>
          <P size="md">
            With Dust Apps, Assistants are not limited to information retrieval
            and engineers are empowered to create new actions for assistants,
            chaining multiple models or calling into their own infrastructure.
          </P>
        </div>
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "sm:col-span-10 sm:col-start-2",
            "md:col-span-6",
            "xl:col-span-5"
          )}
        >
          <div className="max-w-[360px]">
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={-20}>
                <img src="/static/landing/api/api1.png" />
              </Div3D>
              <Div3D depth={20} className="absolute top-0">
                <img src="/static/landing/api/api2.png" />
              </Div3D>
              <Div3D depth={60} className="absolute top-0">
                <img src="/static/landing/api/api3.png" />
              </Div3D>
            </Hover3D>
          </div>
          <H3 className="text-white">
            Dust API:
            <br />
            Use Assistants and Data Sources programmatically
          </H3>
          <P size="md">
            Dust’s API allows expending the means to interact with assistants
            and their Data Sources from outside Dust's webapp, allowing
            programmatic manipulation of strongly customized LLM models.
          </P>
        </div>
      </Grid>
    </>
  );
}

RecruitingPeople.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
