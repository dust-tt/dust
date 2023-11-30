import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Button,
  Div3D,
  DriveLogo,
  Hover3D,
  NotionLogo,
  SlackLogo,
} from "@dust-tt/sparkle";
import React, { Component, createRef, ReactNode, RefObject } from "react";
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
      slidesToShow: 3,
      slidesToScroll: 3,
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

const SystemItem = ({
  children,
  name,
  background = "linear-gradient(180deg, rgba(218,188,125,1) 0%, rgba(184,142,72,1) 72%, rgba(115,93,58,1) 73%, rgba(220,191,143,1) 74%, rgba(223,198,159,1) 100%)",
  question,
  className = "",
}: {
  children: ReactNode;
  name: string;
  background?: string;
  question: string;
  className?: string;
}) => {
  const singleChild = React.Children.only(children);

  if (!React.isValidElement(singleChild)) {
    console.error(
      "Invalid children for ReactiveIcon. It must be a single React element."
    );
    return null;
  }

  const modifiedChild = React.cloneElement(
    singleChild as React.ReactElement<any, any>,
    {
      className: classNames(
        singleChild.props.className,
        "h-8 w-8 md:h-12 md:w-12"
      ),
    }
  );
  return (
    <div
      className={classNames(
        "grid w-full cursor-default grid-cols-4 gap-y-3 px-4 py-10",
        className
      )}
    >
      <Hover3D>
        <Div3D depth={-10} className="h-20 w-20">
          <div
            className="h-20 w-20 rounded-3xl shadow-xl"
            style={{ background: background }}
          />
        </Div3D>
        <Div3D depth={40} className="absolute left-0 top-0 h-20 w-20 p-4">
          {modifiedChild}
        </Div3D>
      </Hover3D>
      <H5 className="col-span-4 truncate text-slate-100">{name}</H5>
      <P className="col-span-4" size="sm">
        {question}
      </P>
    </div>
  );
};

const DroidItem = ({
  name,
  question,
  visual,
  background = "linear-gradient(180deg, rgba(218,188,125,1) 0%, rgba(184,142,72,1) 72%, rgba(115,93,58,1) 73%, rgba(220,191,143,1) 74%, rgba(223,198,159,1) 100%)",
  className = "",
}: {
  name: string;
  question: string;
  visual: string;
  background?: string;
  className?: string;
}) => {
  return (
    <div
      className={classNames(
        "grid w-full cursor-default grid-cols-4 gap-y-3 px-4 py-10",
        className
      )}
    >
      <Hover3D className="relative h-20 w-20">
        <Div3D depth={-10}>
          <div
            className="h-20 w-20 rounded-3xl shadow-xl"
            style={{ background: background }}
          />
        </Div3D>
        <Div3D depth={30} className="absolute top-0 h-20 w-20">
          <img
            src="./static/landing/droids/Droid_Shadow.png"
            className="h-20 w-20"
          />
        </Div3D>
        <Div3D depth={50} className="absolute top-0 h-20 w-20">
          <img src={visual} className="h-20 w-20" />
        </Div3D>
      </Hover3D>
      <H5 className="col-span-4 truncate text-slate-100">{name}</H5>
      <P className="col-span-4" size="sm">
        {question}
      </P>
    </div>
  );
};

const slides = [
  <DroidItem
    key="2"
    background="linear-gradient(180deg, rgba(218,188,125,1) 0%, rgba(184,142,72,1) 72%, rgba(115,93,58,1) 73%, rgba(220,191,143,1) 74%, rgba(223,198,159,1) 100%)"
    visual="./static/landing/droids/Droid_Cream_7.png"
    name="@hiringExpert"
    question="Draft me a job description following company script for this job."
  />,
  <DroidItem
    key="3"
    background="linear-gradient(180deg, rgba(180,157,87,1) 0%, rgba(159,134,61,1) 72%, rgba(105,85,38,1) 73%, rgba(196,173,98,1) 74%, rgba(158,136,71,1) 100%)"
    visual="./static/landing/droids/Droid_Green_4.png"
    name="@onboardingBuddy"
    question="Could you walk me through the typical workflow for a project in my department?"
  />,
  <SystemItem
    key="1"
    name="@notion"
    background="linear-gradient(180deg, rgba(241,245,249,1) 0%, rgba(203,213,225,1) 100%)"
    question="Can you find the onboarding checklist for new hires?"
  >
    <NotionLogo />
  </SystemItem>,
  <DroidItem
    key="4"
    visual="./static/landing/droids/Droid_Sky_8.png"
    background="linear-gradient(180deg, rgba(196,208,217,1) 0%, rgba(174,186,194,1) 72%, rgba(89,92,98,1) 73%, rgba(210,202,196,1) 74%, rgba(199,188,180,1) 100%)"
    name="@salesExpert"
    question="Which potential customers wanted to wait until we had the Android version live?"
  />,
  <DroidItem
    key="6"
    visual="./static/landing/droids/Droid_Orange_6.png"
    background="linear-gradient(180deg, rgba(233,230,225,1) 0%, rgba(217,205,201,1) 72%, rgba(170,120,140,1) 73%, rgba(230,221,215,1) 74%, rgba(215,210,205,1) 100%)"
    name="@salesWriter"
    question="Draft an email to the following prospects updating them about our new Android capabilities."
  />,
  <DroidItem
    key="6"
    visual="./static/landing/droids/Droid_Red_8.png"
    background="linear-gradient(180deg, rgba(224,224,218,1) 0%, rgba(166,167,159,1) 72%, rgba(113,90,81,1) 73%, rgba(211,208,201,1) 74%, rgba(206,203,199,1) 100%)"
    name="@dataExpert"
    question="How do I write an SQL query to find the top-performing products by region?"
  />,
  <DroidItem
    key="7"
    visual="./static/landing/droids/Droid_Yellow_4.png"
    background="linear-gradient(180deg, rgba(193,184,173,1) 0%, rgba(193,183,172,1) 72%, rgba(124,95,72,1) 73%, rgba(207,197,187,1) 74%, rgba(215,210,205,1) 100%)"
    name="@uxWriterAssistant"
    question="Can you draft 3 proposals for a 140 character version for this text?"
  />,
  <SystemItem
    key="5"
    name="@drive"
    background="linear-gradient(180deg, rgba(241,245,249,1) 0%, rgba(203,213,225,1) 100%)"
    question="Can you find the slide deck from last month's marketing presentation for me?"
  >
    <DriveLogo />
  </SystemItem>,
  <DroidItem
    key="8"
    visual="./static/landing/droids/Droid_Pink_6.png"
    background="linear-gradient(180deg, rgba(233,230,225,1) 0%, rgba(217,205,201,1) 72%, rgba(170,120,140,1) 73%, rgba(230,221,215,1) 74%, rgba(215,210,205,1) 100%)"
    name="@weeklyReport"
    question="Write me the report for last week's feature releases."
  />,
  <DroidItem
    key="9"
    visual="./static/landing/droids/Droid_Teal_5.png"
    background="linear-gradient(180deg, rgba(125,154,148,1) 0%, rgba(78,111,107,1) 72%, rgba(52,74,71,1) 73%, rgba(136,169,164,1) 74%, rgba(152,178,172,1) 100%)"
    name="@companyGenius"
    question="What was the outcome of the last board meeting regarding our expansion plans?"
  />,
  <DroidItem
    key="11"
    visual="./static/landing/droids/Droid_Sky_4.png"
    background="linear-gradient(180deg, rgba(164,159,142,1) 0%, rgba(185,179,163,1) 72%, rgba(113,105,94,1) 73%, rgba(221,215,199,1) 74%, rgba(217,213,200,1) 100%)"
    name="@officeManager"
    question="Where can I find white paper and office supplies?"
  />,
  <SystemItem
    key="10"
    name="@slack"
    background="linear-gradient(0deg, rgba(58,18,62,1) 0%, rgba(109,53,115,1) 100%)"
    question="Summarize me last month's daily stand-ups for the team."
  >
    <SlackLogo />
  </SystemItem>,
  <DroidItem
    key="12"
    visual="./static/landing/droids/Droid_Red_5.png"
    background="linear-gradient(180deg, rgba(215,189,176,1) 0%, rgba(173,136,115,1) 72%, rgba(127,62,45,1) 73%, rgba(225,204,190,1) 74%, rgba(222,200,184,1) 100%)"
    name="@spreadsheetExpert"
    question="Can you help me write a VLOOKUP formula to match employee names with their IDs?"
  />,
];
