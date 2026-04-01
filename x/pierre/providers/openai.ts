import * as fs from "fs";
import OpenAI from "openai";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses.mjs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const payload: ResponseCreateParamsStreaming = {
  model: "gpt-5.4",
  input: [
    {
      role: "developer",
      content: [
        {
          type: "input_text",
          text: 'You are a helpful assistant.',
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: "<dust_system>\n- Sender: Pierre Milliotte (:mention_user[Pierre Milliotte]{sId=oZujjEmhUC}) <pierre@dust.tt>\n- Conversation: eOKGGvY5uM\n- Sent at: Apr 01, 2026, 16:30:04 GMT+2\n- Source: web\n</dust_system>\n\n@gpt5 get me the weather in madrid",
        },
      ],
    },
    {
      type: "function_call",
      call_id: "call_4TMO3pMamdhMQfsqEcYKJSHW",
      name: "common_utilities__get_current_time",
      arguments: '{"include_formats":["iso","locale"]}',
    },
    {
      type: "function_call",
      call_id: "call_MWcbf5u6d4NOZlrwzdmpo13M",
      name: "web_search_browse__websearch",
      arguments: '{"query":"current weather Madrid"}',
    },
    {
      type: "function_call_output",
      call_id: "call_4TMO3pMamdhMQfsqEcYKJSHW",
      output:
        "ISO: 2026-04-01T14:30:07.369Z\nLocale: 4/1/2026, 4:30:07 PM (Wednesday)",
    },
    {
      type: "function_call_output",
      call_id: "call_MWcbf5u6d4NOZlrwzdmpo13M",
      output:
        '[{"type":"resource","resource":{"uri":"https://www.accuweather.com/en/es/madrid/308526/weather-forecast/308526","text":"Current Weather. 12:29 PM. 58°F. Sunny. RealFeel® 59° · Looking Ahead. Pleasant Saturday. Madrid Weather Radar. Madrid Weather Radar. Static Radar Temporarily ...","title":"Madrid, Madrid, Spain Weather Forecast","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"ekx"}},{"type":"resource","resource":{"uri":"https://weather.com/weather/today/l/f620d7fe58f453124aa71caa578d94f09a298b74f2e9bd519413ad3d9ce6a771","text":"Partly cloudy. Scattered frost possible. Low 32F. Winds N at 5 to 10 mph. Humidity. 52%.","title":"Weather Forecast and Conditions for Madrid, Madrid, Spain","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"n1k"}},{"type":"resource","resource":{"uri":"https://www.wunderground.com/weather/es/madrid","text":"Mostly clear. Low 38F. N winds at 10 to 20 mph, decreasing to less than 5 mph. icon. TomorrowThu 04/ ...","title":"Madrid, Spain Weather Conditions","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"g8q"}},{"type":"resource","resource":{"uri":"https://weather.com/weather/tenday/l/f620d7fe58f453124aa71caa578d94f09a298b74f2e9bd519413ad3d9ce6a771","text":"Clear skies. Low 42F. Winds N at 10 to 15 mph. Humidity. 59%.","title":"10-Day Weather Forecast for Madrid, Madrid, Spain","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"duj"}},{"type":"resource","resource":{"uri":"https://www.bbc.com/weather/3117735","text":"Day by day forecast ; Tonight · A clear sky and a moderate breeze ; Wednesday 1st AprilWed 1st · Sunny and a gentle breeze · High20° 67° ; Thursday 2nd AprilThu 2nd.","title":"Madrid - BBC Weather","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"sil"}},{"type":"resource","resource":{"uri":"https://www.theweathernetwork.com/en/city/es/madrid/madrid/current","text":"H: 20° L: 6°. Hourly. Full 72 hours · 7am. Mainly clear. 9°. Feels 7. POP. 0%. 8am. Mainly sunny. 8°. Feels 6. POP. 0%. 9am. Mainly sunny. 10°. Feels 7.","title":"Madrid, MD, ES Current Weather","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"aqj"}},{"type":"resource","resource":{"uri":"https://weather.com/weather/today/l/Valdeacederas+Tetu%C3%A1n+Madrid+Spain?canonicalCityId=663174d0ea8ac456fd4372d2bc0bfac8","text":"Today. 67° / 37°. Sunny. 1%. 14 mph ... Plentiful sunshine. High 67F. Winds N at 10 to 20 mph. ... Clear skies. Low 37F. Winds N at 10 to 20 mph.","title":"Valdeacederas, Tetuán, Madrid, Spain Weather","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"cvs"}},{"type":"resource","resource":{"uri":"https://www.weatherbug.com/weather-forecast/now/madrid-madrid-sp","text":"Sunny. High temperature around 64F. Dew point will be around 34F with an average humidity of 49%. Winds will be 8 mph from the N. Tonight. Lo46° ...","title":"Madrid, Madrid, ES Weather Today & Tomorrow","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"a31"}},{"type":"resource","resource":{"uri":"https://www.wunderground.com/hourly/es/madrid","text":"Mainly clear skies. Low 38F. N winds at 10 to 20 mph, decreasing to less than 5 mph. Sun. 8:00AM. 8:39 ...","title":"Madrid, Spain Hourly Weather Forecast","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"eks"}},{"type":"resource","resource":{"uri":"https://www.timeanddate.com/weather/spain/madrid","text":"Weather in Madrid, Madrid, Spain ... Sunny. Feels Like: 54 °F Forecast: 66 / 35 °F Wind: 7 mph ↑ from North ...","title":"Weather for Madrid, Madrid, Spain","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"bpe"}},{"type":"resource","resource":{"uri":"https://www.timeanddate.com/weather/spain/madrid","text":"Weather in Madrid, Madrid, Spain ... Sunny. Feels Like: 54 °F Forecast: 66 / 35 °F Wind: 7 mph ↑ from North ...","title":"Weather for Madrid, Madrid, Spain - Time and Date","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"dba"}},{"type":"resource","resource":{"uri":"https://weather.com/weather/hourbyhour/l/66d93786ffcc98f9cd3bae34e03d05c3d4daa0178c2c4bffe4cfd354cda80400","text":"Hourly Weather Madrid, Madrid, Spain · as of 5:00 PM PDT · 3 am. 51°. Clear. 1%. 1%. 62%. 8 mph. 0 in · 4 am. 49°. Clear. 1%. 1%. 65%. 7 mph. 0 in · 5 am. 48°.","title":"Hourly Weather Forecast for Madrid, Madrid, Spain | weather.com","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"cx6"}},{"type":"resource","resource":{"uri":"https://www.accuweather.com/en/es/madrid/308526/current-weather/308526","text":"Madrid, Madrid · Current Weather. 6:07 AM. 49°F. Mostly clear. RealFeel® 45°. Chilly. RealFeel Guide. Chilly. 40° to 52°. Jacket or sweater ...","title":"Current Weather - Madrid - AccuWeather","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"ch7"}},{"type":"resource","resource":{"uri":"https://www.wunderground.com/hourly/es/madrid","text":"Mainly clear skies. Low 38F. N winds at 10 to 20 mph, decreasing to less than 5 mph. Sun. 8:00AM. 8:39 ...","title":"Madrid, Spain Hourly Weather Forecast","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"as8"}},{"type":"resource","resource":{"uri":"https://weather.metoffice.gov.uk/forecast/ezjmun1p8","text":"Madrid (Spain) weather ; Next hour. 14°C · 14 degrees Celsius ; Wednesday. 19°C · 19 degrees Celsius ; Thursday. 17°C · 17 degrees Celsius ; Friday. 20°C · 20 degrees ...","title":"Madrid (Spain) weather - Met Office","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"drk"}},{"type":"resource","resource":{"uri":"https://www.yr.no/en/forecast/hourly-table/2-3117732/Spain/Madrid/Madrid?i=0","text":"Thursday 9 Apr. Night: cloudy. Morning: cloudy. Afternoon: cloudy. Evening: partly cloudy. Maximum minimum temperature:18°/7°. Precipitation 0.2 mm. Wind ...","title":"Yr - Madrid - Hourly weather forecast","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"bs0"}}]',
    },
  ],
  reasoning: {
    effort: "none",
    summary: "auto",
  },
  tools: [
    {
      type: "function",
      strict: false,
      name: "web_search_browse__websearch",
      description:
        "A tool that performs a Google web search based on a string query.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The query used to perform the Google search. If requested by the user, use the Google syntax `site:` to restrict the search to a particular website or domain.",
          },
        },
        required: ["query"],
        additionalProperties: false,
        $schema: "http://json-schema.org/draft-07/schema#",
      },
    },
    {
      type: "function",
      strict: false,
      name: "web_search_browse__webbrowser",
      description:
        "A tool to browse websites, you can provide a list of up to 16 urls to browse all at once.",
      parameters: {
        type: "object",
        properties: {
          urls: {
            type: "array",
            items: {
              type: "string",
            },
            maxItems: 16,
            description: "List of urls to browse (max: 16)",
          },
          screenshotMode: {
            type: "string",
            enum: ["none", "viewport", "fullPage"],
            description:
              "Screenshot mode: 'none' (default), 'viewport', or 'fullPage'.",
          },
          links: {
            type: "boolean",
            description: "If true, also retrieve outgoing links from the page.",
          },
        },
        required: ["urls"],
        additionalProperties: false,
        $schema: "http://json-schema.org/draft-07/schema#",
      },
    },
    {
      type: "function",
      strict: false,
      name: "common_utilities__get_current_time",
      description:
        "Return the current date and time in multiple convenient formats.",
      parameters: {
        type: "object",
        properties: {
          include_formats: {
            type: "array",
            items: {
              type: "string",
              enum: ["iso", "utc", "timestamp", "locale"],
              description: "Specify which formats to return. Defaults to all.",
            },
            maxItems: 4,
          },
        },
        additionalProperties: false,
        $schema: "http://json-schema.org/draft-07/schema#",
      },
    },
  ],
  text: {},
  include: ["reasoning.encrypted_content"],
  tool_choice: "auto",
  stream: true,
} as ResponseCreateParamsStreaming;

const client = new OpenAI({
  apiKey: process.env.DUST_MANAGED_OPENAI_API_KEY,
  baseURL: "https://api.openai.com/v1",
  defaultHeaders: {
    "Content-Type": "application/json; charset=utf-8",
    Accept: "application/json; charset=utf-8",
  },
});

const call = async () => {
  const events = await client.responses.create(payload);

  const logEvents = [];

  for await (const event of events) {
    logEvents.push(event);
  }
  await fs.promises.writeFile(
    path.join(__dirname, `openai_events_${Date.now().toString()}.json`),
    JSON.stringify(logEvents, null, 2),
    "utf8"
  );
};

call();
