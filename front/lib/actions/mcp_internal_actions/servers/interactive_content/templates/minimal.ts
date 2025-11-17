import type { SlideTemplate } from "../templates";

export const minimalTemplate: SlideTemplate = {
  id: "minimal",
  name: "Minimal",
  description:
    "Clean, uncluttered design with ample white space and focused content",
  type: "slides",
  structure: "Cover → Content → Data → Summary",
  code: `<Slideshow.Slide.Cover
    title="Your Title Here"
    subtitle="Subtitle"
    className="bg-white border-b border-gray-200"
    titleClassName="text-gray-900 font-light"
    subtitleClassName="text-gray-600"
  />

  <Slideshow.Slide.Bullets
    title="Key Points"
    items={[
      "First key message",
      "Second important point",
      "Third crucial insight",
      "Fourth summary item"
    ]}
    className="bg-white"
    titleClassName="text-gray-900 border-b border-gray-200 pb-2"
  />

  <Slideshow.Slide.Full className="bg-gray-50">
    <Slideshow.Heading className="text-gray-900 mb-8">Data Overview</Slideshow.Heading>
    <div className="grid grid-cols-2 gap-8">
      <div className="bg-white p-6 rounded shadow-sm">
        <div className="text-3xl font-light text-gray-900 mb-2">Value</div>
        <div className="text-sm text-gray-600">Metric Name</div>
      </div>
      <div className="bg-white p-6 rounded shadow-sm">
        <div className="text-3xl font-light text-gray-900 mb-2">Value</div>
        <div className="text-sm text-gray-600">Metric Name</div>
      </div>
    </div>
  </Slideshow.Slide.Full>

  <Slideshow.Slide.Full className="bg-white">
    <div className="text-center space-y-4">
      <Slideshow.Heading className="text-gray-900">Summary</Slideshow.Heading>
      <Slideshow.Text className="text-lg text-gray-700 max-w-2xl mx-auto">
        Clean, professional conclusion with clear next steps and key takeaways.
      </Slideshow.Text>
    </div>
  </Slideshow.Slide.Full>`,
};
