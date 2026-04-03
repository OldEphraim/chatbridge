'use client'

import { createContext, useContext, useCallback, useState, type ReactNode } from 'react'

interface PluginContextValue {
  sendPluginMessage: (message: string) => void
  setSendHandler: (handler: (message: string) => void) => void
}

const PluginContext = createContext<PluginContextValue>({
  sendPluginMessage: () => {},
  setSendHandler: () => {},
})

export function PluginProvider({ children }: { children: ReactNode }) {
  const [sendHandler, setSendHandlerState] = useState<(message: string) => void>(() => () => {})

  const setSendHandler = useCallback((handler: (message: string) => void) => {
    setSendHandlerState(() => handler)
  }, [])

  const sendPluginMessage = useCallback((message: string) => {
    sendHandler(message)
  }, [sendHandler])

  return (
    <PluginContext.Provider value={{ sendPluginMessage, setSendHandler }}>
      {children}
    </PluginContext.Provider>
  )
}

export function usePlugin() {
  return useContext(PluginContext)
}
