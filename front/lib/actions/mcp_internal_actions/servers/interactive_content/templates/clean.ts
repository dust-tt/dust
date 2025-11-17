import type { SlideTemplate } from "../templates";

export const cleanTemplate: SlideTemplate = {
  id: "clean",
  name: "Clean",
  description:
    "Crisp, organized design with clear hierarchy and professional typography",
  type: "slides",
  structure: "Title → Content → Analysis → Actions",
  code: `<Slideshow.Slide.Cover
    title="Presentation Title"
    subtitle="Professional Business Template"
    className="bg-white"
    titleClassName="text-4xl font-semibold text-gray-900"
    subtitleClassName="text-lg text-gray-600 font-medium"
  />

  <Slideshow.Slide.Full className="bg-white">
    <div className="max-w-4xl mx-auto">
      <Slideshow.Heading className="text-gray-900 font-semibold mb-6">
        Main Content
      </Slideshow.Heading>
      <Slideshow.Text className="text-lg leading-relaxed text-gray-700">
        Clear, professional content with excellent readability and
        structured information hierarchy.
      </Slideshow.Text>
    </div>
  </Slideshow.Slide.Full>

  <Slideshow.Slide.Split className="bg-white">
    <div className="space-y-4">
      <Slideshow.Heading className="text-gray-900 font-semibold">Analysis</Slideshow.Heading>
      <div className="space-y-3 text-gray-700">
        <div className="flex items-start">
          <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
          <div>First key insight</div>
        </div>
        <div className="flex items-start">
          <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
          <div>Second important finding</div>
        </div>
        <div className="flex items-start">
          <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
          <div>Third critical observation</div>
        </div>
      </div>
    </div>
    <div className="bg-gray-50 p-8 rounded-lg border">
      <div className="h-40 bg-white rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
        <div className="text-gray-500 font-medium">Visual Content</div>
      </div>
    </div>
  </Slideshow.Slide.Split>

  <Slideshow.Slide.Bullets
    title="Action Items"
    items={[
      "First recommended action",
      "Second strategic initiative",
      "Third implementation step",
      "Fourth follow-up activity"
    ]}
    className="bg-white"
    titleClassName="text-gray-900 font-semibold"
  />`,
};
