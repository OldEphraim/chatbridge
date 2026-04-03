import { Chess } from 'chess.js'
import { createClient } from '@/lib/supabase/server'
import { ToolResult } from '../types'

interface HandlerContext {
  conversationId: string
  userId: string
}

async function getOrCreateSession(context: HandlerContext) {
  const supabase = createClient()
  const { data: session } = await supabase
    .from('app_sessions')
    .select('*')
    .eq('conversation_id', context.conversationId)
    .eq('plugin_id', 'chess')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return { supabase, session }
}

export async function startChessGame(
  params: { playerColor?: 'white' | 'black' },
  context: HandlerContext
): Promise<ToolResult> {
  const supabase = createClient()
  const game = new Chess()
  const playerColor = params.playerColor || 'white'

  const state = {
    fen: game.fen(),
    pgn: game.pgn(),
    playerColor,
    moveHistory: [] as string[],
    isGameOver: false,
    result: null as string | null,
  }

  const { data: session, error } = await supabase
    .from('app_sessions')
    .insert({
      conversation_id: context.conversationId,
      plugin_id: 'chess',
      state,
      status: 'active',
    })
    .select()
    .single()

  if (error) {
    return { success: false, error: 'Failed to create chess session' }
  }

  return {
    success: true,
    showUI: true,
    data: {
      gameId: session.id,
      fen: game.fen(),
      playerColor,
      turn: 'w',
      legalMoves: game.moves(),
      isGameOver: false,
      moveHistory: [],
    },
  }
}

export async function makeChessMove(
  params: { move: string },
  context: HandlerContext
): Promise<ToolResult> {
  const { supabase, session } = await getOrCreateSession(context)

  if (!session) {
    return { success: false, error: 'No active chess game found. Start a new game first.' }
  }

  const game = new Chess(session.state.fen)

  try {
    const result = game.move(params.move)
    if (!result) {
      return {
        success: false,
        error: `Invalid move: ${params.move}. Legal moves: ${game.moves().join(', ')}`,
      }
    }
  } catch {
    return {
      success: false,
      error: `Invalid move: ${params.move}. Legal moves: ${game.moves().join(', ')}`,
    }
  }

  const moveHistory = [...(session.state.moveHistory || []), params.move]
  const isGameOver = game.isGameOver()
  let gameResult: string | null = null

  if (isGameOver) {
    if (game.isCheckmate()) {
      gameResult = game.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate'
    } else if (game.isDraw()) {
      gameResult = 'Draw'
      if (game.isStalemate()) gameResult = 'Draw by stalemate'
      if (game.isThreefoldRepetition()) gameResult = 'Draw by threefold repetition'
      if (game.isInsufficientMaterial()) gameResult = 'Draw by insufficient material'
    }
  }

  const newState = {
    fen: game.fen(),
    pgn: game.pgn(),
    playerColor: session.state.playerColor,
    moveHistory,
    isGameOver,
    result: gameResult,
  }

  await supabase
    .from('app_sessions')
    .update({
      state: newState,
      status: isGameOver ? 'completed' : 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id)

  return {
    success: true,
    showUI: true,
    data: {
      gameId: session.id,
      fen: game.fen(),
      playerColor: session.state.playerColor,
      turn: game.turn(),
      legalMoves: game.moves(),
      isGameOver,
      isCheck: game.isCheck(),
      result: gameResult,
      moveHistory,
      lastMove: params.move,
    },
  }
}

export async function getChessHint(
  params: Record<string, never>,
  context: HandlerContext
): Promise<ToolResult> {
  const { session } = await getOrCreateSession(context)

  if (!session) {
    return { success: false, error: 'No active chess game found.' }
  }

  const game = new Chess(session.state.fen)

  return {
    success: true,
    data: {
      fen: game.fen(),
      turn: game.turn(),
      legalMoves: game.moves({ verbose: true }),
      moveHistory: session.state.moveHistory || [],
      isCheck: game.isCheck(),
      playerColor: session.state.playerColor,
    },
  }
}

export async function getBoardState(
  params: Record<string, never>,
  context: HandlerContext
): Promise<ToolResult> {
  const { session } = await getOrCreateSession(context)

  if (!session) {
    return { success: false, error: 'No active chess game found.' }
  }

  const game = new Chess(session.state.fen)

  return {
    success: true,
    showUI: true,
    data: {
      gameId: session.id,
      fen: game.fen(),
      playerColor: session.state.playerColor,
      turn: game.turn(),
      legalMoves: game.moves(),
      isGameOver: game.isGameOver(),
      isCheck: game.isCheck(),
      result: session.state.result,
      moveHistory: session.state.moveHistory || [],
    },
  }
}

export const chessHandlers: Record<string, (params: any, context: HandlerContext) => Promise<ToolResult>> = {
  start_chess_game: startChessGame,
  make_chess_move: makeChessMove,
  get_chess_hint: getChessHint,
  get_board_state: getBoardState,
}
