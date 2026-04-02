# CLAUDE.md — ChatBridge

## Project Overview
ChatBridge is an AI chat platform with third-party app integration. Users chat with an AI assistant that can invoke third-party apps (chess, weather, GitHub) — rendering interactive UI inline in the chat and maintaining context about app state across the conversation.

## Tech Stack
- **Framework:** Next.js 14 (App Router) + TypeScript
- **UI:** React 18 + Tailwind CSS + shadcn/ui
- **Database:** Supabase (PostgreSQL + Auth)
- **AI:** Anthropic Claude Sonnet 4 via Vercel AI SDK (`ai` + `@ai-sdk/anthropic`)
- **Chess:** `chess.js` + `react-chessboard`
- **Deployment:** Vercel

## Architecture

### Plugin System (CRITICAL — this is the core of the project)
Each third-party app is a "plugin" that lives in `src/plugins/<app-name>/`. Every plugin exports:

1. **`manifest.ts`** — Plugin metadata + tool definitions (JSON Schema compatible with Claude's function calling)
2. **`component.tsx`** — React component rendered inline in the chat when the plugin is active (`"use client"`)
3. **`handlers.ts`** — Server-side tool execution functions

The plugin registry (`src/plugins/registry.ts`) auto-collects all plugin manifests and provides:
- `getAllTools()` — returns Claude-compatible tool definitions for all registered plugins
- `executeToolCall(toolName, params, userId)` — routes a tool call to the correct plugin handler
- `getPluginForTool(toolName)` — maps tool name back to plugin ID for UI rendering

### Chat Flow
1. User sends message
2. API route builds system prompt (includes active app states) + attaches all plugin tools
3. Claude responds — either with text or a tool call
4. If tool call: execute via plugin handler → return result to Claude → Claude responds with text incorporating the result
5. If the tool call activates a UI (chess board, weather card, etc.), render the plugin component inline as a special message type
6. Plugin component manages its own state and communicates updates back via a React context (`PluginContext`)
7. On subsequent messages, the system prompt includes current app state summaries

### Message Types
Messages in the DB and UI have a `type` field:
- `"user"` — normal user message
- `"assistant"` — normal AI response
- `"app_ui"` — renders a plugin component inline (stored with `pluginId` + `initialState`)
- `"tool_result"` — hidden from user, used for LLM context

### Authentication
- **Platform auth:** Supabase Auth (email + password). Protect all routes with middleware.
- **Per-app OAuth (GitHub):** Server-side OAuth2 flow. Tokens stored in `oauth_tokens` table. The GitHub plugin checks if user has a valid token before executing tools; if not, its tool handler returns `{ needsAuth: true, authUrl: "..." }` and the UI renders a "Connect GitHub" button.

## Database Schema (Supabase/PostgreSQL)

```sql
-- Users are managed by Supabase Auth (auth.users)
-- We reference auth.users.id as user_id

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT DEFAULT 'New Chat',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'app_ui', 'tool_result')),
  plugin_id TEXT,
  plugin_state JSONB,
  tool_call_id TEXT,
  tool_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  state JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own data
CREATE POLICY "Users see own conversations" ON conversations FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users see own messages" ON messages FOR ALL USING (
  conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid())
);
CREATE POLICY "Users see own app sessions" ON app_sessions FOR ALL USING (
  conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid())
);
CREATE POLICY "Users see own tokens" ON oauth_tokens FOR ALL USING (user_id = auth.uid());
```

## File Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout with Supabase provider
│   ├── page.tsx                      # Redirect to /chat or /login
│   ├── login/
│   │   └── page.tsx                  # Login/signup form (Supabase Auth)
│   ├── chat/
│   │   ├── layout.tsx                # Chat layout with sidebar
│   │   ├── page.tsx                  # New chat / redirect to latest
│   │   └── [conversationId]/
│   │       └── page.tsx              # Chat view for specific conversation
│   └── api/
│       ├── chat/
│       │   └── route.ts              # POST: streaming chat with Claude + tool use
│       ├── conversations/
│       │   └── route.ts              # GET: list, POST: create
│       ├── conversations/[id]/
│       │   └── route.ts              # GET: messages for conversation
│       ├── auth/
│       │   └── callback/
│       │       └── route.ts          # Supabase auth callback
│       └── oauth/
│           ├── github/
│           │   ├── authorize/
│           │   │   └── route.ts      # Redirect to GitHub OAuth
│           │   └── callback/
│           │       └── route.ts      # Handle GitHub OAuth callback
│           └── [provider]/
│               └── status/
│                   └── route.ts      # Check if user has valid token
├── components/
│   ├── ChatSidebar.tsx               # Conversation list
│   ├── ChatMessages.tsx              # Message list renderer
│   ├── ChatInput.tsx                 # Message input with send button
│   ├── MessageBubble.tsx             # Single message (handles text + app_ui types)
│   └── PluginUIRenderer.tsx          # Renders the correct plugin component based on pluginId
├── plugins/
│   ├── registry.ts                   # Auto-registers all plugins, exports getAllTools + executeToolCall
│   ├── types.ts                      # Shared plugin types (PluginManifest, ToolDefinition, etc.)
│   ├── chess/
│   │   ├── manifest.ts               # Chess plugin manifest + tool defs
│   │   ├── component.tsx             # Interactive chess board ("use client")
│   │   └── handlers.ts              # Chess tool handlers (start game, make move, get hint, get state)
│   ├── weather/
│   │   ├── manifest.ts               # Weather plugin manifest + tool defs
│   │   ├── component.tsx             # Weather dashboard card ("use client")
│   │   └── handlers.ts              # Weather API calls (server-side, API key in env)
│   └── github/
│       ├── manifest.ts               # GitHub plugin manifest + tool defs
│       ├── component.tsx             # GitHub repos/issues viewer ("use client")
│       └── handlers.ts              # GitHub API calls (needs OAuth token)
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Browser Supabase client
│   │   ├── server.ts                 # Server Supabase client (uses cookies)
│   │   └── middleware.ts             # Auth middleware helper
│   ├── plugin-context.tsx            # React context for plugin state updates
│   └── utils.ts                      # Helpers
├── middleware.ts                      # Next.js middleware: redirect unauthenticated users to /login
```

## Environment Variables (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENWEATHER_API_KEY=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

## Plugin Implementation Details

### Chess Plugin
- `chess.js` manages all game logic server-side in the tool handlers. Store the FEN string in `app_sessions.state`.
- The `component.tsx` uses `react-chessboard` for the board UI. It receives the current FEN as a prop and renders the board.
- User moves are made by drag-and-drop on the board. When the user drops a piece, the component calls a client-side handler that sends the move as a new chat message (e.g., "I moved e2 to e4") OR directly calls an API endpoint that updates the game state via chess.js and returns the new FEN.
- SIMPLER APPROACH (preferred for one-shot reliability): User interacts with the board, and the component posts the move back to the chat as a user message. The LLM then calls `make_chess_move` tool. This keeps all state management server-side and avoids complex bidirectional communication.
- For hints: when user asks "what should I do?", include the FEN AND the list of legal moves in the tool result so Claude doesn't hallucinate illegal moves.
- The chess component should display: the board, whose turn it is, move history, and game status.

### Weather Plugin
- Server-side only — the tool handler calls OpenWeatherMap API.
- The component just renders the weather data as a nice card (temperature, conditions, icon, forecast).
- No ongoing state. The component receives weather data as props and renders it.
- Stateless — no app session needed.

### GitHub Plugin (OAuth)
- Before executing any GitHub tool, check if user has a valid `oauth_tokens` entry for GitHub.
- If no token: return `{ needsAuth: true, authUrl: "/api/oauth/github/authorize" }` from the tool handler.
- The component detects `needsAuth` and renders a "Connect GitHub" button that opens the auth URL in a popup.
- After OAuth completes, the popup redirects to `/api/oauth/github/callback` which stores the token and closes the popup.
- Tools: `list_github_repos` (lists user's repos), `search_github_issues` (search issues in a repo), `get_repo_details` (get repo info).
- The component renders a list of repos or issues in a card layout.

## Critical Implementation Notes

1. **Streaming:** Use Vercel AI SDK's `streamText` for the chat endpoint and `useChat` hook on the client. This handles streaming + tool calls automatically.

2. **Tool use flow with AI SDK:** When Claude calls a tool, the AI SDK's `maxSteps` option allows multi-step tool use. Set `maxSteps: 5`. The `tools` object passed to `streamText` should include `execute` functions that call the plugin handlers.

3. **Rendering app UI:** When a tool call results in UI (chess board, weather card), save a message with `type: 'app_ui'` and `plugin_id` + `plugin_state` (the tool result data). The `MessageBubble` component checks the type and renders `PluginUIRenderer` for `app_ui` messages.

4. **Context retention:** On every chat API call, load all active `app_sessions` for the conversation and include their state summaries in the system prompt. This is how the chatbot "remembers" what happened in apps.

5. **System prompt structure:**
```
You are ChatBridge, a helpful AI assistant with access to third-party apps.

Available apps and their current state:
{{#each activeAppSessions}}
[{{pluginName}} - {{status}}]
{{stateSummary}}
{{/each}}

When a user wants to use an app, call the appropriate tool. When they ask about an app's state, use the context above.
Only invoke app tools when the user's request is clearly related to that app.
For general questions, respond normally without using any tools.
```

6. **Conversation history:** Load previous messages for the conversation and send them as the `messages` array to Claude. Limit to last 50 messages to avoid context window issues.

7. **Error handling:** Wrap all tool executions in try/catch. On failure, return a user-friendly error message as the tool result so Claude can communicate it naturally.

8. **Supabase Auth:** Use `@supabase/ssr` package for Next.js App Router integration. The middleware checks for a session and redirects to /login if not authenticated. Use `createServerClient` in API routes and `createBrowserClient` on the client.

## UI Design Notes
- Clean, minimal chat interface. Dark/light mode optional but nice.
- Sidebar shows conversation list. Click to switch conversations. "New Chat" button at top.
- Messages render in a scrollable container. User messages right-aligned, assistant left-aligned.
- App UI (chess board, weather card, etc.) renders as a full-width card within the message flow.
- Loading states: show a typing indicator while Claude is streaming. Show a spinner on the app UI while tools are executing.
- Use Tailwind + shadcn for consistent styling. Install shadcn components: button, input, card, scroll-area, avatar, dropdown-menu, separator.

## Commands

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build
npm run build

# The app expects a Supabase project to be set up with the schema above.
# Run the SQL in the Supabase SQL editor to create the tables.
```

## What "Done" Looks Like (Test Scenarios)
1. ✅ Open app → see login page → sign up with email/password → get redirected to chat
2. ✅ Send "Hello" → get streaming AI response
3. ✅ Refresh page → conversation history is still there
4. ✅ Say "let's play chess" → chess board appears in chat
5. ✅ Make moves on the chess board (drag and drop works)
6. ✅ Say "what should I do?" mid-game → get a contextual move suggestion
7. ✅ Game ends or user moves on → conversation continues normally
8. ✅ Say "what's the weather in Austin?" → weather card appears with data
9. ✅ Say "show me my GitHub repos" → prompted to connect GitHub → after OAuth → repos shown
10. ✅ Switch between apps in one conversation (play chess, then check weather)
11. ✅ Ask "what is 2+2?" → normal answer, no app invoked
12. ✅ Ask about previous app interaction ("how did my chess game go?") → chatbot remembers