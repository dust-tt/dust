import type { FC } from "react";
import { Div3D, Hover3D } from "@dust-tt/sparkle";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { H2 } from "@app/components/home/ContentComponents";

export interface UseCase {
  title: string;
  content: string;
  images: string[]; // Simplified to just array of image paths
}

interface UseCasesSectionProps {
  title?: string;
  useCases?: UseCase[];
  fromColor?: string;
  toColor?: string;
}

export const defaultUseCases: UseCase[] = [
  {
    title: "Ticket Resolution",
    content:
      "Smart answer suggestions and contextual knowledge at your fingertips.",
    images: [
      "/static/landing/support/front.png",
      "/static/landing/support/front.png",
      "/static/landing/support/front.png",
      "/static/landing/support/front.png",
    ],
  },
  {
    title: "Agent Coaching",
    content:
      "Helps support agents learn best practices and company knowledge faster.",
    images: [
      "/static/landing/slack/slack1.png",
      "/static/landing/slack/slack2.png",
      "/static/landing/slack/slack3.png",
      "/static/landing/slack/slack4.png",
    ],
  },
  {
    title: "Documentation Builder",
    content:
      "Converts resolved support tickets into searchable knowledge base articles and FAQ.",
    images: [
      "/static/landing/slack/slack1.png",
      "/static/landing/slack/slack2.png",
      "/static/landing/slack/slack3.png",
      "/static/landing/slack/slack4.png",
    ],
  },
  {
    title: "Customer Insights",
    content:
      "Turn customer feedback from every channel into actionable insights.",
    images: [
      "/static/landing/slack/slack1.png",
      "/static/landing/slack/slack2.png",
      "/static/landing/slack/slack3.png",
      "/static/landing/slack/slack4.png",
    ],
  },
];

// Fixed depths for the 3D effect
const LAYER_DEPTHS = [-20, 20, 40, 70];

export const UseCasesSection: FC<UseCasesSectionProps> = ({
  title = "Top use cases",
  useCases = defaultUseCases,
  fromColor = "from-sky-200",
  toColor = "to-sky-500",
}) => (
  <section className="w-full py-12">
    <div className="mb-12">
      <H2 from={fromColor} to={toColor}>
        {title}
      </H2>
    </div>

    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-x-16 lg:gap-y-16">
      {useCases.map((useCase, index) => (
        <ImgBlock key={index} title={useCase.title} content={useCase.content}>
          <Hover3D depth={-20} perspective={1000} className="relative">
            {useCase.images.map((src, imgIndex) => (
              <Div3D
                key={imgIndex}
                depth={LAYER_DEPTHS[imgIndex]}
                className={imgIndex > 0 ? "absolute top-0" : ""}
              >
                <img
                  src={src}
                  alt={`${useCase.title} ${imgIndex + 1}`}
                  style={
                    src.includes("front.png")
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
