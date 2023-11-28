import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import {
  Avatar,
  ChevronLeftIcon,
  ChevronRightIcon,
  Div3D,
  Hover3D,
  IconButton,
} from "@dust-tt/sparkle";
import React, { Component, createRef, RefObject } from "react";
import Slider from "react-slick";

import { classNames } from "@app/lib/utils";

interface SliderExtended extends Slider {
  slickNext: () => void;
  slickPrev: () => void;
  slickGoTo: (slide: number) => void;
}

export default class SimpleSlider extends Component {
  // Create a ref for the Slider component
  slider: RefObject<SliderExtended> = createRef();
  state = {
    currentSlide: 0,
  };

  goToNext = () => {
    const { currentSlide } = this.state;
    // Assuming you have a constant for the number of slides to scroll
    const slidesToScroll = 3;
    this.slider.current?.slickGoTo(currentSlide + slidesToScroll);
  };

  goToPrevious = () => {
    const { currentSlide } = this.state;
    const slidesToScroll = 3;
    this.slider.current?.slickGoTo(currentSlide - slidesToScroll);
  };

  handleBeforeChange = (oldIndex: number, newIndex: number): void => {
    this.setState({ currentSlide: newIndex });
  };

  render() {
    const settings = {
      infinite: true,
      centerMode: true,
      slidesToShow: 4,
      slidesToScroll: 4,
      centerPadding: "120px",
      speed: 800,
      arrows: false,
      beforeChange: this.handleBeforeChange,
    };
    return (
      <>
        <Slider ref={this.slider} {...settings}>
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Green_2.jpg"
            name="@notion"
            question="What are you exactly?"
          />
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Red_3.jpg"
            name="@hiringExpert"
            question="What are you exactly?"
          />
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Pink_6.jpg"
            name="@onboardingBuddy"
            question="What are you exactly?"
          />
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Sky_5.jpg"
            name="@salesExpert"
            question="What are you exactly?"
          />
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Indigo_7.jpg"
            name="@dataExpert"
            question="What are you exactly?"
          />
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Orange_2.jpg"
            name="@contentAssistant"
            question="What are you exactly?"
          />
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Indigo_7.jpg"
            name="@codingAssistant"
            question="What are you exactly?"
          />
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Orange_2.jpg"
            name="@companyGenius"
            question="What are you exactly?"
          />
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Sky_5.jpg"
            name="@salesExpert"
            question="What are you exactly?"
          />
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Indigo_7.jpg"
            name="@codingAssistant"
            question="What are you exactly?"
          />
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Orange_2.jpg"
            name="@spreadsheetExpert"
            question="What are you exactly?"
          />
          <AssistantItem
            visual="https://dust.tt/static/droidavatar/Droid_Sky_5.jpg"
            name="@slack"
            question="What are you exactly?"
          />
        </Slider>
        <div className="flex w-full flex-row justify-center gap-4">
          <div
            className="transition-300 h-5 w-5 rounded-full bg-slate-400 transition-all hover:bg-slate-200"
            onClick={this.goToPrevious}
          >
            <IconButton icon={ChevronLeftIcon} size="sm" variant="secondary" />
          </div>
          <div
            className="transition-300 h-5 w-5 rounded-full bg-slate-400 transition-all hover:bg-slate-200"
            onClick={this.goToNext}
          >
            <IconButton icon={ChevronRightIcon} size="sm" variant="secondary" />
          </div>
        </div>
      </>
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
        "grid w-[320px] cursor-default grid-cols-3 gap-x-3 gap-y-1 px-2 py-10",
        className
      )}
    >
      <Div3D depth={30} className="row-span-2">
        <Avatar size="auto" isRounded visual={visual} className="" />
      </Div3D>
      <Div3D
        depth={80}
        className={classNames(
          "col-span-2 font-objektiv text-base font-semibold text-slate-100"
        )}
      >
        {name}
      </Div3D>
      <Div3D
        depth={60}
        className="font-regular col-span-2 font-objektiv text-base text-slate-400"
      >
        {question}
      </Div3D>
    </Hover3D>
  );
};
