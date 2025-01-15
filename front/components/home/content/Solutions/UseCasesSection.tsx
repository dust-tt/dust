import { Div3D, Hover3D } from "@dust-tt/sparkle";
import type { FC } from "react";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { H2, P } from "@app/components/home/ContentComponents";

export interface UseCaseProps {
  sectionTitle?: string;
  sectionDescription?: string;
  items: {
    title: string;
    content: string;
    images: string[];
  }[];
}

// Just like Benefits, make a simple props interface with the base type plus colors
interface UseCaseSectionProps {
  useCase: UseCaseProps;
  fromColor: string;
  toColor: string;
}

// Fixed depths for the 3D effect
const LAYER_DEPTHS = [-20, 20, 40, 70];

export const UseCasesSection: FC<UseCaseSectionProps> = ({
  useCase,
  fromColor,
  toColor,
}) => (
  <section className="w-full py-12">
    <div className="mb-12">
      <H2 from={fromColor} to={toColor}>
        {useCase.sectionTitle}
      </H2>
      <P size="lg" className="pb-6 text-slate-50">
        {useCase.sectionDescription}
      </P>
    </div>

    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-x-16 lg:gap-y-16">
      {useCase.items.map((item, index) => (
        <ImgBlock key={index} title={item.title} content={item.content}>
          <Hover3D depth={-20} perspective={1000} className="relative">
            {item.images.map((src, imgIndex) => (
              <Div3D
                key={imgIndex}
                depth={LAYER_DEPTHS[imgIndex]}
                className={imgIndex > 0 ? "absolute top-0" : ""}
              >
                <img
                  src={src}
                  alt={`${item.title} ${imgIndex + 1}`}
                  style={
                    src.includes("support1.png")
                      ? { width: "200%", height: "200%" }
                      : {}
                  }
                />
              </Div3D>
            ))}
          </Hover3D>
        </ImgBlock>
      ))}
    </div>
  </section>
);
