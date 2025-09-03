"use client";

import { Slideshow } from "@viz/components/dust/slideshow/v1";

const THEME = "dark";

export default function TestVisualization() {
  return (
    <div className="w-full h-screen">
      <Slideshow.Root>
        {/* Cover slide */}
        <Slideshow.Slide.Cover title="Mobile Strategy Review" theme={THEME} />

        {/* Title top */}
        <Slideshow.Slide.TitleTop title="Goals" theme={THEME}>
          <Slideshow.Text>
            Our goals are to:
            <ul>
              <li>Increase mobile app usage</li>
              <li>Increase mobile app revenue</li>
            </ul>
          </Slideshow.Text>
        </Slideshow.Slide.TitleTop>

        {/* Slide with heading 2 and text */}
        <Slideshow.Slide.TitleTopH2
          title="Vision for the Mobile roadmap"
          theme="light"
        >
          <Slideshow.Text>
            Dive into the innovative features and enhancements...
          </Slideshow.Text>
        </Slideshow.Slide.TitleTopH2>
      </Slideshow.Root>
    </div>
  );
}
