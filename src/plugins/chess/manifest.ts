import { PluginManifest } from '../types'

export const chessManifest: PluginManifest = {
  id: 'chess',
  name: 'Chess',
  description: 'Play chess against the AI assistant',
  hasUI: true,
  tools: [
    {
      name: 'start_chess_game',
      description: 'Start a new chess game. Call this when the user wants to play chess.',
      parameters: {
        type: 'object',
        properties: {
          playerColor: {
            type: 'string',
            enum: ['white', 'black'],
            description: 'The color the player wants to play as. Defaults to white.',
          },
        },
      },
    },
    {
      name: 'make_chess_move',
      description: 'Make a chess move in the current game. Use standard algebraic notation (e.g., e4, Nf3, O-O).',
      parameters: {
        type: 'object',
        properties: {
          move: {
            type: 'string',
            description: 'The move in standard algebraic notation (SAN), e.g., "e4", "Nf3", "O-O"',
          },
        },
        required: ['move'],
      },
    },
    {
      name: 'get_chess_hint',
      description: 'Get the current board state and legal moves to suggest a move to the player.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_board_state',
      description: 'Get the current state of the chess board including FEN, legal moves, and move history.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  ],
}
