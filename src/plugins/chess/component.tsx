'use client'

import { useCallback } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePlugin } from '@/lib/plugin-context'

interface ChessComponentProps {
  state: {
    fen: string
    playerColor?: string
    turn?: string
    legalMoves?: string[]
    isGameOver?: boolean
    isCheck?: boolean
    result?: string | null
    moveHistory?: string[]
    gameId?: string
  }
  conversationId?: string
}

export default function ChessComponent({ state }: ChessComponentProps) {
  const { sendPluginMessage } = usePlugin()

  const orientation = state.playerColor === 'black' ? 'black' : 'white'
  const turnLabel = state.turn === 'w' ? 'White' : 'Black'

  const onDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null; piece: any }) => {
      if (state.isGameOver || !targetSquare) return false

      const game = new Chess(state.fen)
      try {
        const move = game.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: 'q',
        })
        if (!move) return false

        sendPluginMessage(`I play ${move.san}`)
        return true
      } catch {
        return false
      }
    },
    [state.fen, state.isGameOver, sendPluginMessage]
  )

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Chess</span>
          {state.isGameOver ? (
            <span className="text-sm font-normal text-red-500">
              Game Over: {state.result}
            </span>
          ) : (
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
              {state.isCheck ? 'Check! ' : ''}
              {turnLabel} to move
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-3">
          <div style={{ width: 400, height: 400 }}>
            <Chessboard
              options={{
                position: state.fen,
                boardOrientation: orientation as 'white' | 'black',
                allowDragging: !state.isGameOver,
                onPieceDrop: onDrop,
              }}
            />
          </div>
          {state.moveHistory && state.moveHistory.length > 0 && (
            <div className="w-full">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Move History:</p>
              <div className="flex flex-wrap gap-1 text-xs">
                {state.moveHistory.map((move, i) => (
                  <span
                    key={i}
                    className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-1.5 py-0.5 rounded"
                  >
                    {i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ''} {move}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
