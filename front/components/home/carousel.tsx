import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Avatar,
  Button,
  Div3D,
  Hover3D,
} from "@dust-tt/sparkle";
import React, { Component, createRef, RefObject } from "react";
import Slider from "react-slick";

import { classNames } from "@app/lib/utils";

import { H5, P } from "./contentComponents";

export const breakpoints = {
  sm: 640, // Tailwind's default for `sm`
  md: 768, // Tailwind's default for `md`
  lg: 1024, // Tailwind's default for `lg`
  xl: 1280, // Tailwind's default for `xl`
  xxl: 1536, // Tailwind's default for `2xl`
};

interface SliderExtended extends Slider {
  slickNext: () => void;
  slickPrev: () => void;
  slickGoTo: (slide: number) => void;
}

export default class SimpleSlider extends Component {
  // Create a ref for the Slider component
  slider: RefObject<SliderExtended> = createRef();
  sliderContainerRef = createRef<HTMLDivElement>();

  state = {
    currentSlide: 0,
    slidesToShow: 1, // Default value
    sliderHeight: 0,
    totalSlides: slides.length,
  };

  updateSliderHeight = () => {
    // Use the ref to get the current height of the slider container
    const height = this.sliderContainerRef.current
      ? this.sliderContainerRef.current.offsetHeight
      : 0;
    this.setState({ sliderHeight: height });
  };

  updateSlidesToShow = () => {
    const windowWidth = window.innerWidth;
    let slidesToShow = 1; // Default to the smallest number

    if (windowWidth >= breakpoints.xxl) {
      slidesToShow = 3;
    } else if (windowWidth >= breakpoints.xl) {
      slidesToShow = 2;
    } else if (windowWidth >= breakpoints.lg) {
      slidesToShow = 2;
    } else if (windowWidth >= breakpoints.md) {
      slidesToShow = 2;
    } else if (windowWidth >= breakpoints.sm) {
      slidesToShow = 1;
    }

    this.setState({ slidesToShow });
  };

  componentDidMount() {
    this.updateSlidesToShow();
    this.updateSliderHeight();
    window.addEventListener("resize", this.updateSlidesToShow);
    window.addEventListener("resize", this.updateSliderHeight);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.updateSlidesToShow);
    window.removeEventListener("resize", this.updateSliderHeight);
  }

  goToNext = () => {
    const { currentSlide, slidesToShow, totalSlides } = this.state;
    this.slider.current?.slickGoTo((currentSlide + slidesToShow) % totalSlides);
  };

  goToPrevious = () => {
    const { currentSlide, slidesToShow, totalSlides } = this.state;
    const newSlideIndex =
      (currentSlide - slidesToShow + totalSlides) % totalSlides;
    this.slider.current?.slickGoTo(newSlideIndex);
  };

  handleBeforeChange = (oldIndex: number, newIndex: number): void => {
    this.setState({ currentSlide: newIndex });
  };

  render() {
    const { sliderHeight } = this.state;
    const settings = {
      infinite: true,
      centerMode: true,
      slidesToShow: 1,
      slidesToScroll: 1,
      swipe: true,
      draggable: true,
      swipeToSlide: true,
      centerPadding: "15%",
      accessibility: true,
      speed: 800,
      arrows: false,
      beforeChange: this.handleBeforeChange,
      responsive: [
        {
          breakpoint: breakpoints.xxl,
          settings: {
            slidesToShow: 3,
            slidesToScroll: 3,
          },
        },
        {
          breakpoint: breakpoints.xl,
          settings: {
            slidesToShow: 2,
            slidesToScroll: 2,
          },
        },
        {
          breakpoint: breakpoints.lg,
          settings: {
            slidesToShow: 2,
            slidesToScroll: 2,
          },
        },
        {
          breakpoint: breakpoints.md,
          settings: {
            slidesToShow: 2,
            slidesToScroll: 2,
          },
        },
        {
          breakpoint: breakpoints.sm,
          settings: {
            slidesToShow: 1,
            slidesToScroll: 1,
          },
        },
      ],
    };
    return (
      <div style={{ height: sliderHeight + "px" }}>
        <div className="absolute left-0 right-0 w-[100vw]">
          <div ref={this.sliderContainerRef}>
            <Slider ref={this.slider} {...settings}>
              {slides}
            </Slider>
            <div className="flex w-full flex-row justify-center gap-4">
              <Button
                icon={ArrowLeftIcon}
                label="Previous"
                labelVisible={false}
                size="xs"
                variant="tertiary"
                onClick={this.goToPrevious}
                disabledTooltip
              />
              <Button
                icon={ArrowRightIcon}
                label="Next"
                labelVisible={false}
                size="xs"
                variant="tertiary"
                onClick={this.goToNext}
                disabledTooltip
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
}

const AssistantItem = ({
  name,
  question,
  visual,
  className = "",
}: {
  name: string;
  question: string;
  visual: string;
  className?: string;
}) => {
  return (
    <Hover3D
      className={classNames(
        "grid w-full cursor-default grid-cols-4 gap-y-3 px-4 py-10",
        className
      )}
    >
      <Div3D depth={40}>
        <div className="h-16 w-16">
          <Avatar size="auto" visual={visual} className="" />
        </div>
      </Div3D>
      <Div3D depth={20} className="col-span-4">
        <H5 className="truncate text-slate-100">{name}</H5>
      </Div3D>
      <Div3D depth={60} className="col-span-4">
        <P size="sm">{question}</P>
      </Div3D>
    </Hover3D>
    // <Hover3D
    //   className={classNames(
    //     "grid w-full cursor-default grid-cols-1 items-center justify-items-center gap-x-3 gap-y-3 px-4 py-10",
    //     className
    //   )}
    // >
    //   <Div3D depth={50}>
    //     <div className="h-16 w-16">
    //       <Avatar size="auto" isRounded visual={visual} className="" />
    //     </div>
    //   </Div3D>
    //   <Div3D
    //     depth={30}
    //     className={classNames(
    //       "w-full truncate text-center font-objektiv text-xl font-semibold text-slate-100"
    //     )}
    //   >
    //     {name}
    //   </Div3D>
    //   <Div3D
    //     depth={80}
    //     className="font-regular text-center font-objektiv text-base text-slate-400"
    //   >
    //     {question}
    //   </Div3D>
    // </Hover3D>
  );
};

const slides = [
  <AssistantItem
    key="1"
    visual="https://dust.tt/static/systemavatar/notion_avatar_full.png"
    name="@notion"
    question="Can you find the onboarding checklist for new hires?"
  />,
  <AssistantItem
    key="2"
    visual="https://dust.tt/static/droidavatar/Droid_Red_2.jpg"
    name="@hiringExpert"
    question="Draft me a job description following company script for this job."
  />,
  <AssistantItem
    key="3"
    visual="https://dust.tt/static/droidavatar/Droid_Pink_1.jpg"
    name="@onboardingBuddy"
    question="Could you walk me through the typical workflow for a project in my department?"
  />,
  <AssistantItem
    key="4"
    visual="https://dust.tt/static/droidavatar/Droid_Sky_8.jpg"
    name="@salesExpert"
    question="What are our new product features and associated sales script?"
  />,
  <AssistantItem
    key="5"
    visual="https://dust.tt/static/systemavatar/drive_avatar_full.png"
    name="@drive"
    question="Can you find the slide deck from last month's marketing presentation for me?"
  />,
  <AssistantItem
    key="6"
    visual="https://dust.tt/static/droidavatar/Droid_Indigo_7.jpg"
    name="@dataExpert"
    question="How do I write an SQL query to find the top-performing products by region?"
  />,
  <AssistantItem
    key="7"
    visual="https://dust.tt/static/droidavatar/Droid_Orange_2.jpg"
    name="@uxWriterAssistant"
    question="Can you draft 3 proposals for a 140 character version for this text?"
  />,
  <AssistantItem
    key="8"
    visual="https://dust.tt/static/droidavatar/Droid_Indigo_6.jpg"
    name="@weeklyReport"
    question="Write me the report for last week's feature releases."
  />,
  <AssistantItem
    key="9"
    visual="https://dust.tt/static/droidavatar/Droid_Orange_1.jpg"
    name="@companyGenius"
    question="What was the outcome of the last board meeting regarding our expansion plans?"
  />,
  <AssistantItem
    key="10"
    visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
    name="@slack"
    question="Summarize me last month's daily stand-ups for the team."
  />,
  <AssistantItem
    key="11"
    visual="https://dust.tt/static/droidavatar/Droid_Sky_5.jpg"
    name="@officeManager"
    question="Where can I find white paper and office supplies?"
  />,
  <AssistantItem
    key="12"
    visual="https://dust.tt/static/droidavatar/Droid_Orange_5.jpg"
    name="@spreadsheetExpert"
    question="Can you help me write a VLOOKUP formula to match employee names with their IDs?"
  />,
];
