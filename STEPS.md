# STEPS.md — ChatBridge Build Order

Complete each step fully before moving to the next. Verify each step works before proceeding.

---

## Step 1: Project Scaffolding

1. Initialize Next.js 14 project with App Router, TypeScript, Tailwind CSS, ESLint.
   ```bash
   npx create-next-app@14 chatbridge --typescript --tailwind --eslint --app --src-dir --use-npm
   ```
2. Install all dependencies:
   ```bash
   npm install ai @ai-sdk/anthropic @supabase/supabase-js @supabase/ssr chess.js react-chessboard zod
   npx shadcn@latest init -d
   npx shadcn@latest add button input card scroll-area avatar dropdown-menu separator sheet
   ```
3. Create the full file structure from CLAUDE.md. Create empty placeholder files for everything.
4. Set up `.env.local` with placeholder values (actual values will be filled in manually).
5. Create `src/plugins/types.ts` with the shared types:
   ```typescript
   export interface PluginManifest {
     id: string;
     name: string;
     description: string;
     tools: ToolDefinition[];
     hasUI: boolean;
     requiresAuth?: boolean;
     authProvider?: string;
   }
   
   export interface ToolDefinition {
     name: string;
     description: string;
     parameters: Record<string, any>; // JSON Schema
   }
   
   export interface ToolResult {
     success: boolean;
     data?: any;
     error?: string;
     showUI?: boolean; // if true, render the plugin component
     needsAuth?: boolean;
     authUrl?: string;
   }
   ```

**Verify:** `npm run dev` starts without errors.

---

## Step 2: Supabase Auth + Database

1. Set up `src/lib/supabase/client.ts` — browser client using `createBrowserClient` from `@supabase/ssr`.
2. Set up `src/lib/supabase/server.ts` — server client using `createServerClient` from `@supabase/ssr` with cookie handling for Next.js App Router.
3. Set up `src/middleware.ts` — refresh session on every request, redirect unauthenticated users to `/login` (except `/login` and `/api/auth/` routes).
4. Build `/login/page.tsx` — simple form with email + password, sign up / sign in toggle. Use Supabase `auth.signInWithPassword` and `auth.signUp`.
5. Build `/api/auth/callback/route.ts` — handle Supabase auth callback (exchange code for session).
6. Build the root `page.tsx` — check auth, redirect to `/chat` if logged in, `/login` if not.

**Verify:** Can sign up, log in, and get redirected to `/chat`. Refreshing keeps you logged in. Going to `/chat` while logged out redirects to `/login`.

---

## Step 3: Basic Chat UI (No AI Yet)

1. Build `ChatSidebar.tsx` — lists conversations from DB, "New Chat" button, click to navigate to `/chat/[id]`.
2. Build `ChatInput.tsx` — text input + send button. Calls a callback with the message text.
3. Build `ChatMessages.tsx` — scrollable list of messages. Auto-scrolls to bottom on new message.
4. Build `MessageBubble.tsx` — renders a single message. User messages right-aligned (blue), assistant left-aligned (gray). For now, only handles `type: 'text'`.
5. Build `/chat/layout.tsx` — sidebar on left, main content area on right.
6. Build `/chat/page.tsx` — "Select a conversation or start a new one" placeholder.
7. Build `/chat/[conversationId]/page.tsx` — loads messages for conversation, renders ChatMessages + ChatInput.
8. Build `/api/conversations/route.ts` — GET (list user's conversations), POST (create new conversation).
9. Build `/api/conversations/[id]/route.ts` — GET (list messages for conversation).

**Verify:** Can create a new conversation, see it in sidebar, type messages (they save to DB and show in the UI). No AI responses yet — just storing user messages.

---

## Step 4: AI Chat with Streaming

1. Build `/api/chat/route.ts`:
   - Accept POST with `{ messages, conversationId }`
   - Load conversation history from DB
   - Call `streamText` from Vercel AI SDK with `anthropic('claude-sonnet-4-20250514')`
   - Use a simple system prompt for now (no plugin stuff yet)
   - Save user message and assistant response to DB
   - Return streaming response
2. Update `/chat/[conversationId]/page.tsx` to use the `useChat` hook from `ai/react`:
   - Point it at `/api/chat`
   - Pass `conversationId` in the request body
   - Show streaming responses in real-time
   - Show a typing indicator while streaming

**Verify:** Send a message → get a streaming AI response. Refresh → conversation history loads. Multi-turn conversation works.

---

## Step 5: Plugin Registry + Tool Framework

1. Build `src/plugins/registry.ts`:
   ```typescript
   import { chessManifest, chessHandlers } from './chess/manifest';
   import { weatherManifest, weatherHandlers } from './weather/manifest';
   import { githubManifest, githubHandlers } from './github/manifest';
   
   const plugins = [
     { manifest: chessManifest, handlers: chessHandlers },
     { manifest: weatherManifest, handlers: weatherHandlers },
     { manifest: githubManifest, handlers: githubHandlers },
   ];
   
   export function getAllTools() { /* return AI SDK compatible tool objects with execute functions */ }
   export function getPluginById(id: string) { /* ... */ }
   ```
2. The `getAllTools()` function should return objects compatible with Vercel AI SDK's `tools` parameter for `streamText`. Each tool should have a `description`, `parameters` (Zod schema), and an `execute` function that calls the corresponding plugin handler.
3. Build stub manifests + handlers for all three plugins (chess, weather, github). The handlers can return placeholder data for now — we'll implement them in the next steps.

**Verify:** Import the registry, call `getAllTools()`, confirm it returns well-formed tool definitions.

---

## Step 6: Chess Plugin (Full Implementation)

1. **`chess/manifest.ts`** — Define tools:
   - `start_chess_game`: params `{ playerColor?: "white" | "black" }`, starts a new game, returns initial FEN
   - `make_chess_move`: params `{ move: string }` (SAN like "e4", "Nf3"), validates and executes the move, returns new FEN + status
   - `get_chess_hint`: params `{ fen: string }`, returns suggested move + explanation (LLM-generated — just return the FEN + legal moves and let Claude analyze in its response)
   - `get_board_state`: params `{ }`, returns current FEN + legal moves + move history + status

2. **`chess/handlers.ts`** — Implement using `chess.js`:
   - Maintain game state via `app_sessions` table (store FEN + PGN in state JSONB)
   - `start_chess_game`: create new Chess instance, save to app_sessions, return `{ fen, gameId: sessionId, legalMoves, showUI: true }`
   - `make_chess_move`: load game from app_sessions, call `game.move(move)`, save new state, return `{ fen, isGameOver, isCheck, result, legalMoves, moveHistory, showUI: true }`
   - `get_chess_hint`: load game, return `{ fen, legalMoves, moveHistory, turn }` — Claude will analyze this in its text response
   - `get_board_state`: load game, return current state
   - All handlers receive `{ conversationId, userId }` as context to load/save the right app_session

3. **`chess/component.tsx`** — `"use client"` React component:
   - Props: `{ state: { fen, legalMoves, moveHistory, isGameOver, result, playerColor } }`
   - Render `react-chessboard` `Chessboard` component with the FEN
   - On piece drop: validate move client-side with chess.js, then send the move as a chat message like "I move [piece] to [square]" or just the SAN notation
   - Show: whose turn it is, move history list, game status (check, checkmate, draw)
   - Style nicely within a card container

4. **Update the chat API route** to:
   - Include plugin tools via `getAllTools()` in the `streamText` call
   - Set `maxSteps: 5` to allow multi-step tool use
   - Load active app_sessions for the conversation and include their state in the system prompt
   - When a tool result has `showUI: true`, save the message with `type: 'app_ui'` and `plugin_id: 'chess'`

5. **Update `MessageBubble.tsx`** to handle `type: 'app_ui'` — render the plugin component with the state data.

6. **Build `PluginUIRenderer.tsx`** — takes `pluginId` and `state`, dynamically renders the correct plugin component (chess, weather, or github).

**Verify:** Say "let's play chess" → board appears → make a move on the board (sends message) → AI responds with updated board → ask "what should I do?" → get a suggestion → play until game over → game status shows correctly.

---

## Step 7: Weather Plugin

1. **`weather/manifest.ts`** — Tools:
   - `get_current_weather`: params `{ city: string, units?: "metric" | "imperial" }`, returns weather data
   - `get_weather_forecast`: params `{ city: string, days?: number }`, returns forecast

2. **`weather/handlers.ts`** — Call OpenWeatherMap API (free tier):
   - Use `OPENWEATHER_API_KEY` from env
   - Return `{ city, temp, feelsLike, conditions, humidity, wind, icon, showUI: true }`
   - For forecast: return array of daily forecasts

3. **`weather/component.tsx`** — Weather card:
   - Show city name, temperature, conditions icon, humidity, wind
   - If forecast data present, show daily forecast row
   - Clean card UI with Tailwind

**Verify:** Say "what's the weather in Austin?" → weather card appears with real data → ask follow-up "should I bring a jacket?" → AI uses the weather context to answer.

---

## Step 8: GitHub Plugin (OAuth)

1. **`/api/oauth/github/authorize/route.ts`**:
   - Generate a random `state` parameter, store in a cookie
   - Redirect to `https://github.com/login/oauth/authorize?client_id=...&redirect_uri=...&scope=repo,read:user&state=...`

2. **`/api/oauth/github/callback/route.ts`**:
   - Verify `state` parameter matches cookie
   - Exchange code for access token via POST to `https://github.com/login/oauth/access_token`
   - Store access token in `oauth_tokens` table for the current user
   - Return HTML that calls `window.close()` (popup closes itself)

3. **`github/handlers.ts`**:
   - Before any tool execution, check `oauth_tokens` for the user + provider "github"
   - If no token: return `{ needsAuth: true, authUrl: "/api/oauth/github/authorize", showUI: true }`
   - `list_github_repos`: GET `https://api.github.com/user/repos`, return repo list
   - `get_repo_details`: GET `https://api.github.com/repos/{owner}/{repo}`, return repo info
   - `search_github_issues`: GET `https://api.github.com/repos/{owner}/{repo}/issues`, return issues

4. **`github/manifest.ts`** — Tools: `list_github_repos`, `get_repo_details`, `search_github_issues`

5. **`github/component.tsx`**:
   - If `needsAuth`: render a "Connect GitHub" button that opens `/api/oauth/github/authorize` in a popup window
   - After auth: render repo list as cards (name, description, stars, language)
   - For issues: render issue list (title, state, labels)

**Verify:** Say "show me my GitHub repos" → "Connect GitHub" button appears → click → OAuth popup → authorize → popup closes → repos appear in chat.

---

## Step 9: Multi-App Context + Completion

1. Update the system prompt builder to include ALL active app sessions:
   ```
   [ACTIVE APPS]
   Chess: Game in progress. FEN: rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR. Black to move.
   Weather: Last checked Austin, TX - 85°F, sunny.
   ```

2. Ensure app sessions get marked as `completed` when:
   - Chess: game is over (checkmate, stalemate, draw)
   - Weather: immediately after showing results (stateless)
   - GitHub: after displaying results

3. Test switching between apps: play chess → check weather → go back to discussing the chess game.

4. Test that unrelated questions ("what is photosynthesis?") get normal answers without tool invocation.

**Verify:** All 12 test scenarios from CLAUDE.md pass.

---

## Step 10: Polish + Deploy

1. Add loading/typing indicators:
   - Pulsing dots while AI is responding
   - Spinner while tool calls are executing
   - Skeleton loading for plugin UIs

2. Error handling:
   - Try/catch around all tool handlers
   - Timeout on API calls (10 seconds)
   - Show user-friendly error messages in chat if a tool fails

3. Conversation management:
   - Auto-title conversations after first exchange (ask Claude for a 3-word title)
   - Delete conversation option in sidebar

4. Responsive layout — chat should work on mobile-ish widths.

5. Deploy to Vercel:
   - Push to GitLab
   - Connect GitLab repo to Vercel (or use Vercel CLI)
   - Set all environment variables in Vercel dashboard
   - Verify deployment works

**Verify:** App works on the deployed URL. All test scenarios pass on production.