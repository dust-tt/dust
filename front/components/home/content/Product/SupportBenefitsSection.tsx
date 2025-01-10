import {
  Avatar,
  Hover3D,
  Icon,
  LightbulbIcon,
  RocketIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { Grid, H2, P } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export function BenefitsSection() {
  return (
    <>
      <Grid>
        <div className="col-span-12 mb-6 mt-6">
          <div>
            <H2 from="from-sky-200" to="to-blue-400">
              Elevate support operations
            </H2>
            {/* <P size="lg">
              Boost your team’s efficiency and drive customer satisfaction.
            </P> */}
          </div>
        </div>
        <div
          className={classNames(
            "col-span-12 pt-2",
            "grid grid-cols-1 gap-x-16 gap-y-8",
            "md:grid-cols-3 md:gap-y-4"
          )}
        >
          <ImgBlock
            title={<>Resolve Issues Faster</>}
            content={
              <>
                Surface relevant information from all connected knowledge bases
                instantly and understand messages in 50+ languages.
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className="justify-left relative flex h-8 items-center"
            >
              <Avatar
                size="xl"
                visual={
                  <Icon
                    visual={RocketIcon}
                    className="text-slate-300"
                    size="xl"
                  />
                }
                backgroundColor="bg-slate-700"
              />
            </Hover3D>
          </ImgBlock>
          <ImgBlock
            title={<>Boost Team Productivity</>}
            content={
              <>
                Keep teams synchronized with real-time access to information
                across all communication channels and reduce onboarding time.
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className="justify-left relative flex h-8 items-center"
            >
              <Avatar
                size="xl"
                visual={
                  <Icon
                    visual={UserGroupIcon}
                    className="text-slate-300"
                    size="xl"
                  />
                }
                backgroundColor="bg-slate-700"
              />
            </Hover3D>
          </ImgBlock>
          <ImgBlock
            title={<>Understand Customer Needs</>}
            content={
              <>
                Gain insights from cross-tool interactions to understand and act
                on customer needs, improve documentation.
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className="justify-left relative flex h-8 items-center"
            >
              <Avatar
                size="xl"
                visual={
                  <Icon
                    visual={LightbulbIcon}
                    className="text-slate-300"
                    size="xl"
                  />
                }
                backgroundColor="bg-slate-700"
              />
            </Hover3D>
          </ImgBlock>
        </div>
      </Grid>
    </>
  );
}
