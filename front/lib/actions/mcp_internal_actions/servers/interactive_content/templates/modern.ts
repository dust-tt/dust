import type { SlideTemplate } from "../templates";

export const modernTemplate: SlideTemplate = {
  id: "modern",
  name: "Modern",
  description: "Contemporary design with bold typography and strategic use of color",
  type: "slides", 
  structure: "Hero → Overview → Features → Conclusion",
  code: `<Slideshow.Slide.Cover
    title="Your Presentation"
    subtitle="Modern Business Style"
    className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white"
    titleClassName="text-5xl font-bold"
    subtitleClassName="text-xl font-light opacity-90"
  />
  
  <Slideshow.Slide.Split className="bg-white">
    <div className="space-y-6">
      <Slideshow.Heading className="text-slate-900 font-semibold">Overview</Slideshow.Heading>
      <Slideshow.Text className="text-lg text-slate-700 leading-relaxed">
        Modern, professional content with strategic use of typography and 
        contemporary design elements.
      </Slideshow.Text>
    </div>
    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl p-8 flex items-center justify-center">
      <div className="w-24 h-24 bg-blue-600 rounded-lg flex items-center justify-center">
        <div className="text-white text-2xl font-bold">Logo</div>
      </div>
    </div>
  </Slideshow.Slide.Split>
  
  <Slideshow.Slide.Full className="bg-slate-50">
    <Slideshow.Heading className="text-center text-slate-900 font-semibold mb-10">Key Features</Slideshow.Heading>
    <div className="grid grid-cols-3 gap-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-lg mx-auto mb-4 flex items-center justify-center">
          <div className="text-white text-xl font-bold">1</div>
        </div>
        <div className="font-semibold text-slate-900 mb-2">Feature One</div>
        <div className="text-sm text-slate-600">Professional description</div>
      </div>
      <div className="text-center">
        <div className="w-16 h-16 bg-indigo-600 rounded-lg mx-auto mb-4 flex items-center justify-center">
          <div className="text-white text-xl font-bold">2</div>
        </div>
        <div className="font-semibold text-slate-900 mb-2">Feature Two</div>
        <div className="text-sm text-slate-600">Modern approach</div>
      </div>
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-700 rounded-lg mx-auto mb-4 flex items-center justify-center">
          <div className="text-white text-xl font-bold">3</div>
        </div>
        <div className="font-semibold text-slate-900 mb-2">Feature Three</div>
        <div className="text-sm text-slate-600">Strategic implementation</div>
      </div>
    </div>
  </Slideshow.Slide.Full>`
};