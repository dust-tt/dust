import { defineTool } from "./helpers";
import { z } from "zod";
import { ok, err } from "./types";
import { logger } from "../utils/logger";
import { APIError, ValidationError } from "../utils/errors";

const WeatherSchema = z.object({
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
});

export const fetchWeather = defineTool(
  "Fetches current weather data for the specified city. " +
    "Automatically logs results in the execution logs (no need to do it manually).",
  z.object({
    city: z.string().describe("Name of the city to get weather for"),
  }),
  WeatherSchema,
  async ({ city }, { log }) => {
    logger.debug(`Fetching weather for city: "${city}"`);
    
    // Validate city parameter
    if (!city.trim()) {
      const validationError = new ValidationError("City name cannot be empty")
        .addContext({ providedCity: city });
      logger.debug(`Weather validation error: ${validationError.message}`);
      return err(`Invalid city name: ${validationError.message}`);
    }
    
    try {
      // First get coordinates for the city
      const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        city
      )}&count=1&language=en&format=json`;
      
      logger.debug(`Geocoding API request: ${geocodeUrl}`);
      const geocodeResponse = await fetch(geocodeUrl);
      
      if (!geocodeResponse.ok) {
        const apiError = new APIError(
          "Geocoding API request failed", 
          geocodeResponse.status
        ).addContext({
          city,
          url: geocodeUrl,
          statusText: geocodeResponse.statusText
        });
        logger.debug(`Geocoding API error: ${apiError.message} (${apiError.statusCode})`);
        return err(`Failed to geocode city: ${apiError.message}`);
      }
      
      const geocodeData = await geocodeResponse.json();

      if (!geocodeData.results?.[0]) {
        const cityNotFoundError = new ValidationError(`City "${city}" not found`)
          .addContext({ 
            searchedCity: city,
            responseData: JSON.stringify(geocodeData) 
          });
        logger.debug(`City not found: ${city}`);
        return err(`City "${city}" not found in geocoding database`);
      }

      const {
        latitude,
        longitude,
        name: foundCity,
        country,
      } = geocodeData.results[0];
      
      logger.debug(`Found city coordinates: ${foundCity}, ${country} (${latitude}, ${longitude})`);

      // Then get weather for those coordinates
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,weathercode`;
      logger.debug(`Weather API request: ${weatherUrl}`);
      
      const response = await fetch(weatherUrl);
      
      if (!response.ok) {
        const apiError = new APIError(
          "Weather API request failed", 
          response.status
        ).addContext({
          city: `${foundCity}, ${country}`,
          coordinates: { latitude, longitude },
          url: weatherUrl,
          statusText: response.statusText
        });
        logger.debug(`Weather API error: ${apiError.message} (${apiError.statusCode})`);
        return err(`Failed to fetch weather data: ${apiError.message}`);
      }
      
      const data = await response.json();
      
      // Validate weather data
      if (!data.current || 
          typeof data.current.temperature_2m !== 'number' || 
          typeof data.current.precipitation !== 'number' || 
          typeof data.current.weathercode !== 'number') {
        const dataError = new APIError("Weather API returned invalid data format")
          .addContext({ 
            response: JSON.stringify(data),
            city: `${foundCity}, ${country}`
          });
        logger.debug(`Weather data validation error: ${dataError.message}`);
        return err(`Weather data for ${foundCity}, ${country} has invalid format`);
      }
      
      log(
        `Weather data for ${foundCity}, ${country}:\n${JSON.stringify(data)}`
      );
      
      logger.debug(`Successfully fetched weather for ${foundCity}, ${country}`);

      return ok({
        city: `${foundCity}, ${country}`,
        temperature: data.current.temperature_2m,
        precipitation: data.current.precipitation,
        weathercode: data.current.weathercode,
        units: {
          temperature: data.current_units.temperature_2m,
          precipitation: data.current_units.precipitation,
        },
      });
    } catch (error) {
      const wrappedError = error instanceof Error 
        ? error 
        : new Error(String(error));
        
      logger.debug(`Error in fetch_weather tool: ${wrappedError.message}`);
      if (wrappedError.stack) {
        logger.debug(`Stack trace: ${wrappedError.stack}`);
      }
      
      return err(
        `Error fetching weather: ${wrappedError.message}`
      );
    }
  }
);
