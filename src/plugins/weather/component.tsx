'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface WeatherComponentProps {
  state: any
}

function unitLabel(units: string) {
  return units === 'metric' ? 'C' : 'F'
}

function speedLabel(units: string) {
  return units === 'metric' ? 'm/s' : 'mph'
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function WeatherIcon({ icon, description, size = 48 }: { icon: string; description?: string; size?: number }) {
  return (
    <img
      src={`https://openweathermap.org/img/wn/${icon}@2x.png`}
      alt={description || 'weather icon'}
      width={size}
      height={size}
    />
  )
}

function CurrentWeather({ state }: { state: any }) {
  const unit = unitLabel(state.units)
  const speed = speedLabel(state.units)

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{state.city}{state.country ? `, ${state.country}` : ''}</span>
          <WeatherIcon icon={state.icon} description={state.description} size={56} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-5xl font-bold">{state.temp}&deg;{unit}</span>
          <span className="text-muted-foreground capitalize">{state.description}</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">{state.feelsLike}&deg;{unit}</div>
            <div>Feels like</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{state.humidity}%</div>
            <div>Humidity</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{state.windSpeed} {speed}</div>
            <div>Wind</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ForecastWeather({ state }: { state: any }) {
  const unit = unitLabel(state.units)

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>
          {state.city}{state.country ? `, ${state.country}` : ''} - Forecast
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {state.forecast.map((day: any) => (
            <div
              key={day.date}
              className="flex flex-col items-center min-w-[90px] rounded-lg border p-3 text-center"
            >
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {formatDate(day.date)}
              </div>
              <WeatherIcon icon={day.icon} description={day.description} size={40} />
              <div className="text-sm font-bold">
                {day.tempMax}&deg;{unit}
              </div>
              <div className="text-xs text-muted-foreground">
                {day.tempMin}&deg;{unit}
              </div>
              <div className="text-xs text-muted-foreground capitalize mt-1 leading-tight">
                {day.description}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function WeatherComponent({ state }: WeatherComponentProps) {
  if (!state) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="py-6 text-center text-muted-foreground">
          No weather data available.
        </CardContent>
      </Card>
    )
  }

  if (state.forecast) {
    return <ForecastWeather state={state} />
  }

  return <CurrentWeather state={state} />
}
