import { PluginManifest } from '../types'

export const weatherManifest: PluginManifest = {
  id: 'weather',
  name: 'Weather',
  description: 'Get current weather and forecasts for any city',
  hasUI: true,
  tools: [
    {
      name: 'get_current_weather',
      description: 'Get the current weather for a city. Call this when the user asks about weather conditions.',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'The city name to get weather for',
          },
          units: {
            type: 'string',
            enum: ['metric', 'imperial'],
            description: 'Temperature units. Defaults to imperial.',
          },
        },
        required: ['city'],
      },
    },
    {
      name: 'get_weather_forecast',
      description: 'Get a multi-day weather forecast for a city.',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'The city name to get the forecast for',
          },
          days: {
            type: 'number',
            description: 'Number of days to forecast (1-5). Defaults to 3.',
          },
        },
        required: ['city'],
      },
    },
  ],
}
