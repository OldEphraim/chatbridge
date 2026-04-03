import { ToolResult } from '../types'

interface HandlerContext {
  conversationId: string
  userId: string
}

const OPENWEATHER_BASE = 'https://api.openweathermap.org/data/2.5'

export async function getCurrentWeather(
  params: { city: string; units?: 'metric' | 'imperial' },
  _context: HandlerContext
): Promise<ToolResult> {
  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    return { success: false, error: 'OpenWeather API key is not configured.' }
  }

  const units = params.units || 'imperial'

  try {
    const url = `${OPENWEATHER_BASE}/weather?q=${encodeURIComponent(params.city)}&appid=${apiKey}&units=${units}`
    const res = await fetch(url)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const message = body?.message || `OpenWeather API returned status ${res.status}`
      return { success: false, error: message }
    }

    const json = await res.json()

    const data = {
      city: json.name,
      country: json.sys?.country,
      temp: Math.round(json.main.temp),
      feelsLike: Math.round(json.main.feels_like),
      humidity: json.main.humidity,
      windSpeed: Math.round(json.wind.speed),
      description: json.weather?.[0]?.description || '',
      icon: json.weather?.[0]?.icon || '01d',
      units,
    }

    return { success: true, data, showUI: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch weather data.' }
  }
}

export async function getWeatherForecast(
  params: { city: string; days?: number },
  _context: HandlerContext
): Promise<ToolResult> {
  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    return { success: false, error: 'OpenWeather API key is not configured.' }
  }

  const days = Math.min(Math.max(params.days || 3, 1), 5)
  const units = 'imperial'
  const cnt = days * 8

  try {
    const url = `${OPENWEATHER_BASE}/forecast?q=${encodeURIComponent(params.city)}&appid=${apiKey}&units=${units}&cnt=${cnt}`
    const res = await fetch(url)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const message = body?.message || `OpenWeather API returned status ${res.status}`
      return { success: false, error: message }
    }

    const json = await res.json()

    // Group 3-hour intervals by day
    const dayMap = new Map<string, {
      temps: number[]
      tempMins: number[]
      tempMaxs: number[]
      descriptions: Map<string, number>
      icons: Map<string, number>
    }>()

    for (const entry of json.list) {
      const date = entry.dt_txt.split(' ')[0] // "YYYY-MM-DD"

      if (!dayMap.has(date)) {
        dayMap.set(date, {
          temps: [],
          tempMins: [],
          tempMaxs: [],
          descriptions: new Map(),
          icons: new Map(),
        })
      }

      const day = dayMap.get(date)!
      day.temps.push(entry.main.temp)
      day.tempMins.push(entry.main.temp_min)
      day.tempMaxs.push(entry.main.temp_max)

      const desc = entry.weather?.[0]?.description || ''
      day.descriptions.set(desc, (day.descriptions.get(desc) || 0) + 1)

      const icon = entry.weather?.[0]?.icon || '01d'
      day.icons.set(icon, (day.icons.get(icon) || 0) + 1)
    }

    const forecast = Array.from(dayMap.entries()).map(([date, day]) => {
      // Pick the most frequent description and icon
      const description = Array.from(day.descriptions.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
      const icon = Array.from(day.icons.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '01d'

      return {
        date,
        temp: Math.round(day.temps.reduce((a, b) => a + b, 0) / day.temps.length),
        tempMin: Math.round(Math.min(...day.tempMins)),
        tempMax: Math.round(Math.max(...day.tempMaxs)),
        description,
        icon,
      }
    })

    const data = {
      city: json.city?.name,
      country: json.city?.country,
      units,
      forecast,
    }

    return { success: true, data, showUI: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch forecast data.' }
  }
}

export const weatherHandlers: Record<string, (params: any, context: HandlerContext) => Promise<ToolResult>> = {
  get_current_weather: getCurrentWeather,
  get_weather_forecast: getWeatherForecast,
}
