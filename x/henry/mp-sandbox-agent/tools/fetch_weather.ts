import { defineTool } from "./helpers";
import { z } from "zod";

export const fetchWeather = defineTool(
  "Fetches current weather data for the specified city",
  z.object({
    city: z.string().describe("Name of the city to get weather for"),
  }),
  z.object({
    city: z.string().describe("Full city name with country"),
    temperature: z.number().describe("Temperature in °C"),
    precipitation: z.number().describe("Precipitation in mm"),
    weathercode: z.number().describe("WMO weather code"),
    units: z
      .object({
        temperature: z.string().describe("Temperature unit (e.g., °C)"),
        precipitation: z.string().describe("Precipitation unit (e.g., mm)"),
      })
      .describe("Measurement units for temperature and precipitation"),
  }),
  async ({ city }) => {
    try {
      // First get coordinates for the city
      const geocodeResponse = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          city
        )}&count=1&language=en&format=json`
      );
      const geocodeData = await geocodeResponse.json();

      if (!geocodeData.results?.[0]) {
        throw new Error(`City "${city}" not found`);
      }

      const {
        latitude,
        longitude,
        name: foundCity,
        country,
      } = geocodeData.results[0];

      // Then get weather for those coordinates
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,weathercode`
      );
      const data = await response.json();

      return {
        city: `${foundCity}, ${country}`,
        temperature: data.current.temperature_2m,
        precipitation: data.current.precipitation,
        weathercode: data.current.weathercode,
        units: {
          temperature: data.current_units.temperature_2m,
          precipitation: data.current_units.precipitation,
        },
      };
    } catch (error) {
      console.error("Error fetching weather:", error);
      return null;
    }
  }
);
