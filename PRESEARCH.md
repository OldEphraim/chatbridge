# ChatBridge — Pre-Search Document

## Case Study Analysis

TutorMeAI's competitive advantage is configurability — teachers shape the chatbot's behavior in ways competitors can't match. Embedding third-party apps inside the chat extends that configurability to code the platform doesn't control. This is the core engineering tension: the more flexible the plugin interface, the larger the attack surface. And this platform serves children.

The assignment frames trust/safety and communication/state as separate challenge categories, but architecturally they collapse into one problem. The postMessage protocol between host and iframe *is* the security boundary. The sandbox attributes that protect users *are* the communication constraints developers work within. Every design decision sits on this axis: flexibility for developers versus safety for students. We chose safety. That means cross-origin iframes with strict sandboxing, origin validation on every message, and a typed protocol constraining what apps can say to the host. This makes developer experience worse — postMessage is clunky, debugging cross-origin iframes is painful, and you lose the ergonomics of same-origin communication. That's an acceptable trade when your users are minors.

The K-12 context isn't a footnote; it's an architectural constraint. COPPA prohibits collecting personal data from children under 13 without parental consent. FERPA protects student education records. These aren't compliance checkboxes — they dictate data flow decisions. Apps receive a session ID, not a student name. Tool invocation parameters are controlled by the LLM, which the platform controls, not by the third-party app. OAuth tokens are stored and proxied server-side; iframes never touch raw credentials. Teacher control over which apps are available isn't just a feature — it's the mechanism by which the platform manages liability. If a third-party app delivers inappropriate content to a student, the first question is: who enabled it? That answer needs to be auditable.

A subtle but critical challenge is completion signaling — knowing when an app interaction is "done." The assignment flags this as where most teams struggle, and the reason is that completion isn't always explicit. A chess game ends with checkmate, but what if the student just stops playing? What if the app crashes? What if the student says "never mind" and asks about homework? The platform needs both explicit completion (the app sends a COMPLETE message with a summary) and implicit completion (heartbeat timeouts, user navigation, conversation topic change). The LLM must handle both gracefully — injecting whatever state summary it has into context so it can discuss what happened, even if the app died unexpectedly.

We landed on an architecture that prioritizes the plugin contract above all else: a typed manifest schema for registration, JSON Schema tool definitions for LLM discovery, a strict postMessage RPC protocol for communication, and iframe sandboxing for isolation. Every app — from a stateless weather widget to a stateful chess game to an OAuth-authenticated Spotify integration — goes through the same interface. The contract is rigid by design. Third-party developers don't get to be creative about how they talk to the platform; they get creative about what they build within it. That constraint is the product.

---

## Technical Architecture

### Stack Decision

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router) + React 18 + TypeScript | Core stack, App Router for API routes + SSR, great Vercel deployment story |
| Backend | Next.js API Routes + WebSocket server (separate process) | Keep it monorepo; WS server handles real-time, API routes handle REST |
| Database | PostgreSQL (via Supabase) | Relational model fits conversations/sessions/app registrations; Supabase gives us auth + realtime + hosted Postgres |
| Auth | Supabase Auth (platform) + custom OAuth proxy (per-app) | Supabase handles platform login (email/password, magic link); we proxy OAuth flows for third-party apps server-side |
| AI | Anthropic Claude (Sonnet 4) via Vercel AI SDK | Best function calling support, native tool use, streaming via AI SDK's `useChat` |
| Real-time | Server-Sent Events for chat streaming, postMessage for iframe comms | SSE is simpler than WebSockets for unidirectional LLM streaming; postMessage is the only option for cross-origin iframe communication |
| App Sandboxing | Iframes with `sandbox` attribute + CSP headers | Industry standard for untrusted third-party content |
| Deployment | Vercel (frontend + API routes) + Railway (if WS server needed) | Standard deployment pattern |

### Fork Base: Chatbox

The assignment requires forking "Chatbox" (chatboxai/chatbox). This is an Electron + React desktop client. Since we need a web-based platform, we'll fork it and substantially restructure: strip the Electron shell, port the React chat UI components to Next.js, and build the plugin system on top. The chat UI components (message rendering, input, conversation list) are the primary value from the fork.

---

## Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js Application                   │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Chat UI    │  │  App Frame   │  │  App Frame    │  │
│  │  (React)     │  │  (iframe)    │  │  (iframe)     │  │
│  │              │  │  Chess App   │  │  Weather App  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘  │
│         │                 │                  │           │
│         │          postMessage RPC    postMessage RPC    │
│         │                 │                  │           │
│  ┌──────┴─────────────────┴──────────────────┴────────┐  │
│  │              Plugin Bridge (Host SDK)               │  │
│  │   - Message routing & origin validation             │  │
│  │   - Tool invocation dispatch                        │  │
│  │   - State synchronization                           │  │
│  │   - Lifecycle management (init/ready/complete)      │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                │
│  ┌──────────────────────┴─────────────────────────────┐  │
│  │              Chat Engine                            │  │
│  │   - Conversation management                         │  │
│  │   - LLM orchestration (Vercel AI SDK + Claude)      │  │
│  │   - Dynamic tool registry                           │  │
│  │   - Context injection (app state → system prompt)   │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                │
│  ┌──────────────────────┴─────────────────────────────┐  │
│  │              Next.js API Routes                     │  │
│  │   /api/chat        - LLM streaming endpoint         │  │
│  │   /api/apps        - App registration CRUD          │  │
│  │   /api/apps/[id]/  - Tool invocation, state         │  │
│  │   /api/auth/       - Supabase auth + OAuth proxy    │  │
│  └──────────────────────┬─────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │   PostgreSQL (Supabase)│
              │   - users             │
              │   - conversations     │
              │   - messages          │
              │   - app_registrations │
              │   - app_sessions      │
              │   - oauth_tokens      │
              └───────────────────────┘
```

---

## Plugin System Design

### App Manifest Schema

Every third-party app registers with a manifest:

```typescript
interface AppManifest {
  id: string;                    // unique identifier, e.g. "chess"
  name: string;                  // display name
  description: string;           // shown to user + injected into LLM context
  version: string;
  icon: string;                  // URL to icon

  // Auth configuration
  auth: {
    type: 'none' | 'api_key' | 'oauth2';
    oauth?: {
      authorizationUrl: string;
      tokenUrl: string;
      scopes: string[];
      clientId: string;
      // clientSecret stored server-side only
    };
  };

  // Tool definitions (JSON Schema, Claude-compatible)
  tools: ToolDefinition[];

  // UI configuration
  ui: {
    iframeSrc: string;           // URL to load in iframe
    defaultWidth: number;
    defaultHeight: number;
    sandbox: string[];           // additional sandbox permissions needed
  };

  // Capabilities
  capabilities: {
    hasUI: boolean;              // does it render an iframe?
    stateful: boolean;           // does it maintain session state?
    requiresCompletion: boolean; // does it signal when done?
  };
}

interface ToolDefinition {
  name: string;                  // e.g. "start_game", "make_move"
  description: string;           // used by LLM for tool selection
  inputSchema: JSONSchema;       // parameters the LLM must provide
  outputSchema?: JSONSchema;     // what the tool returns
}
```

### postMessage Protocol

All host ↔ iframe communication uses a typed message envelope:

```typescript
// Host → App messages
type HostMessage =
  | { type: 'INIT'; payload: { sessionId: string; userId: string; theme: string } }
  | { type: 'TOOL_INVOKE'; payload: { toolName: string; params: Record<string, any>; correlationId: string } }
  | { type: 'CONTEXT_UPDATE'; payload: { conversationContext: string } }
  | { type: 'DESTROY' };

// App → Host messages
type AppMessage =
  | { type: 'READY' }
  | { type: 'TOOL_RESULT'; payload: { correlationId: string; result: any; error?: string } }
  | { type: 'STATE_UPDATE'; payload: { state: any; summary: string } }
  | { type: 'COMPLETE'; payload: { summary: string; data?: any } }
  | { type: 'RESIZE'; payload: { width: number; height: number } }
  | { type: 'ERROR'; payload: { code: string; message: string } };
```

### Plugin Lifecycle

```
1. REGISTRATION:  App manifest submitted → validated → stored in DB
2. DISCOVERY:     User message → LLM sees tool descriptions → selects tool
3. ACTIVATION:    Platform loads iframe → sends INIT → waits for READY
4. INVOCATION:    LLM calls tool → platform sends TOOL_INVOKE → app processes → returns TOOL_RESULT
5. INTERACTION:   User interacts with app UI → app sends STATE_UPDATE → platform injects into LLM context
6. COMPLETION:    App sends COMPLETE → platform closes iframe → injects summary into conversation
7. FOLLOW-UP:     LLM has full context of what happened → can discuss results
```

### Iframe Sandboxing

```html
<iframe
  src={app.ui.iframeSrc}
  sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
  referrerpolicy="no-referrer"
  loading="lazy"
/>
```

Key security decisions:
- **Never** combine `allow-scripts` + `allow-same-origin` on same-origin content (allows sandbox escape)
- Cross-origin apps get `allow-same-origin` so they can use their own cookies/storage, but browser SOP prevents parent DOM access
- CSP `frame-src` whitelist on host restricts which domains can be iframed
- Origin validation on every `postMessage` received
- Rate limiting on message frequency per iframe

---

## Three Apps

### 1. Chess (Required) — High complexity, stateful, bidirectional

**Libraries:** `chess.js` (game logic, FEN/PGN, legal move validation) + `react-chessboard` (UI)

**Tools:**
| Tool | Input | Output |
|---|---|---|
| `start_chess_game` | `{ color?: 'white' \| 'black' }` | `{ gameId, fen, playerColor }` |
| `make_chess_move` | `{ move: string }` (SAN notation) | `{ fen, isGameOver, result?, lastMove }` |
| `get_chess_hint` | `{ fen: string }` | `{ suggestedMove, explanation }` |
| `get_board_state` | `{}` | `{ fen, legalMoves, moveHistory, status }` |

**Chat integration flow:**
- User: "let's play chess" → LLM calls `start_chess_game` → iframe loads with board
- User makes moves via drag-and-drop → app sends `STATE_UPDATE` with new FEN
- User: "what should I do here?" → LLM calls `get_board_state`, reads FEN + legal moves, suggests move with explanation
- Game ends → app sends `COMPLETE` with PGN and result summary
- User: "why did I lose?" → LLM has full game history in context, analyzes

**LLM hint strategy:** Send FEN + full legal moves list to Claude. LLMs hallucinate illegal moves ~20% of the time without the legal moves constraint. Always validate the suggested move against `chess.js` before presenting to user.

### 2. Weather Dashboard — Low complexity, external API, no auth

**API:** OpenWeatherMap (free tier, API key stored server-side)

**Tools:**
| Tool | Input | Output |
|---|---|---|
| `get_weather` | `{ city: string, units?: 'metric' \| 'imperial' }` | `{ temp, conditions, humidity, wind, forecast }` |
| `get_forecast` | `{ city: string, days: number }` | `{ daily: [{ date, high, low, conditions }] }` |

**UI:** Simple dashboard card showing current conditions + 5-day forecast with icons. No ongoing state — renders result and is done.

**Chat integration:** User: "what's the weather in Austin?" → LLM calls `get_weather` → dashboard renders inline → user can ask follow-ups ("should I bring an umbrella?") and LLM has the weather data in context.

### 3. Spotify Playlist Creator — Medium complexity, OAuth2 required

**API:** Spotify Web API (OAuth2 PKCE flow)

**Tools:**
| Tool | Input | Output |
|---|---|---|
| `search_spotify_tracks` | `{ query: string, limit?: number }` | `{ tracks: [{ id, name, artist, album, previewUrl }] }` |
| `create_playlist` | `{ name: string, description?: string }` | `{ playlistId, url }` |
| `add_tracks_to_playlist` | `{ playlistId: string, trackIds: string[] }` | `{ success, trackCount }` |

**Auth flow:**
1. User: "make me a study playlist" → LLM calls `search_spotify_tracks`
2. Platform detects Spotify app requires OAuth → shows "Connect Spotify" button in chat
3. User clicks → popup opens → Spotify OAuth consent → popup returns auth code via postMessage
4. Platform exchanges code for tokens server-side, stores encrypted in DB
5. Subsequent tool calls include the user's access token
6. Token refresh handled automatically by platform

**UI:** Track list with album art, preview playback buttons, playlist builder interface.

---

## LLM Integration

### Dynamic Tool Registry

```typescript
class ToolRegistry {
  private tools: Map<string, { appId: string; definition: ToolDefinition }> = new Map();

  register(appId: string, tools: ToolDefinition[]) {
    for (const tool of tools) {
      this.tools.set(`${appId}_${tool.name}`, { appId, definition: tool });
    }
  }

  // Returns Claude-compatible tool definitions for enabled apps
  getToolsForRequest(enabledAppIds: string[]): AnthropicTool[] {
    return [...this.tools.entries()]
      .filter(([_, { appId }]) => enabledAppIds.includes(appId))
      .map(([key, { definition }]) => ({
        name: key,
        description: definition.description,
        input_schema: definition.inputSchema,
      }));
  }
}
```

### Context Injection

When an app is active, its state summary is injected into the system prompt:

```
You are a helpful AI tutor. The following apps are currently active:

[CHESS APP - Active Game]
Current position (FEN): rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1
It is Black's turn. The game is in progress.
Move history: 1. e4

When the user asks about the chess game, use the chess tools to interact with it.
Do not suggest moves that are not in the legal moves list.
```

### Streaming + Tool Use

Using Vercel AI SDK's `streamText` with Claude:

```typescript
const result = await streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: buildSystemPrompt(activeApps, appStates),
  messages: conversationHistory,
  tools: toolRegistry.getToolsForRequest(enabledApps),
  maxSteps: 5, // allow multi-step tool use
  onStepFinish: async (step) => {
    if (step.toolCalls) {
      for (const call of step.toolCalls) {
        // Route tool call to appropriate app iframe via postMessage
        await pluginBridge.invokeToolOnApp(call);
      }
    }
  },
});
```

---

## Database Schema

```sql
-- Platform users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Registered third-party apps
CREATE TABLE app_registrations (
  id TEXT PRIMARY KEY,            -- e.g. "chess", "weather", "spotify"
  manifest JSONB NOT NULL,        -- full AppManifest
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages (chat history)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,              -- 'user', 'assistant', 'tool'
  content TEXT NOT NULL,
  tool_call JSONB,                -- if role='assistant' and it called a tool
  tool_result JSONB,              -- if role='tool', the result
  app_id TEXT,                    -- which app was involved, if any
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active app sessions within conversations
CREATE TABLE app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  app_id TEXT REFERENCES app_registrations(id),
  state JSONB,                    -- current app state (e.g. chess FEN)
  status TEXT DEFAULT 'active',   -- 'active', 'completed', 'error'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- OAuth tokens for authenticated apps
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  app_id TEXT REFERENCES app_registrations(id),
  access_token TEXT NOT NULL,     -- encrypted
  refresh_token TEXT,             -- encrypted
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, app_id)
);
```

---

## Security Model

### Trust Layers

1. **App Registration:** Admin-only initially. Apps must provide a manifest that passes schema validation. In production, this would include a review process.
2. **Iframe Isolation:** Each app runs in a sandboxed cross-origin iframe. No DOM access to the host. No shared cookies/storage.
3. **Message Validation:** Every postMessage is validated: origin check, schema validation (Zod), rate limiting.
4. **Data Minimization:** Apps receive only: session ID, tool invocation params, and theme. No user PII unless explicitly part of a tool call (and even then, the LLM decides what to send).
5. **Token Security:** OAuth tokens stored server-side only, encrypted at rest. Iframes never see raw tokens — tool invocations are proxied through the platform's API routes.
6. **Content Filtering:** App UI is sandboxed, but the platform can additionally scan tool results before injecting into LLM context or displaying to user.

### K-12 Specific Concerns

- COPPA compliance: no personal data collection from children under 13 without parental consent
- FERPA: student education records must be protected; apps should not receive identifying student info
- Content filtering on tool results: before injecting into LLM context, scan for inappropriate content
- Teacher controls: teachers can enable/disable specific apps per classroom/session

---

## Error Handling

| Scenario | Strategy |
|---|---|
| Iframe fails to load | 10s timeout → show error card in chat → "The chess app couldn't load. Want to try again?" |
| Tool invocation timeout | 15s timeout → return error to LLM → LLM explains to user |
| App sends malformed message | Log + ignore, don't crash the host |
| OAuth token expired | Auto-refresh; if refresh fails, prompt re-auth |
| LLM suggests invalid chess move | Validate against legal moves → retry up to 3 times → fallback to "I'm not sure, try [legal moves]" |
| App crashes mid-session | Detect via heartbeat timeout → save last known state → offer to restart |

---

## Deployment Plan

- **Vercel:** Next.js app (frontend + API routes)
- **Supabase:** PostgreSQL + Auth + Row Level Security
- **Chess app:** Deployed as separate static site on Vercel (separate project), loaded via iframe
- **Weather app:** Could be same Vercel project or separate
- **Spotify app:** Separate Vercel project (needs its own OAuth redirect URI)

Each app is a standalone deployable unit with its own URL, loaded into the platform via iframe. This mirrors real third-party architecture.

---

## Development Plan

| Day | Focus |
|---|---|
| Day 1 (Tue) | Fork Chatbox, strip Electron, get basic Next.js chat with Claude streaming working. Pre-search doc + video. |
| Day 2 (Wed) | Plugin system: manifest schema, registration API, postMessage bridge, iframe rendering in chat. |
| Day 3 (Thu) | Chess app: chess.js + react-chessboard in standalone app, integrate with platform via tools + iframe. Full lifecycle. |
| Day 4 (Fri) | Weather app + Spotify app (OAuth flow). Multiple app routing. Early submission. |
| Day 5 (Sat) | Error handling, edge cases, testing scenarios 1-7. |
| Day 6 (Sun) | Polish, deploy, documentation, demo video, social post. Final submission. |

---

## AI Cost Analysis (Projections)

### Assumptions
- Average conversation: 10 messages (5 user, 5 assistant)
- Average tool invocations per session: 3
- Tool definitions overhead: ~2,000 tokens (3 apps registered)
- Average input tokens per request: ~3,000 (system prompt + history + tool defs)
- Average output tokens per request: ~500
- Claude Sonnet 4 pricing: $3/M input, $15/M output

### Per-Session Cost
- Input: 5 requests × 3,000 tokens = 15,000 tokens → $0.045
- Output: 5 requests × 500 tokens = 2,500 tokens → $0.0375
- **Total per session: ~$0.08**

### Monthly Projections (assuming 10 sessions/user/month)

| Scale | Sessions/Month | LLM Cost | Infra Cost | Total |
|---|---|---|---|---|
| 100 users | 1,000 | $80 | $25 | ~$105/mo |
| 1,000 users | 10,000 | $800 | $50 | ~$850/mo |
| 10,000 users | 100,000 | $8,000 | $200 | ~$8,200/mo |
| 100,000 users | 1,000,000 | $80,000 | $2,000 | ~$82,000/mo |

At scale, prompt caching (Anthropic's `cache_control`) could reduce input token costs by ~90% for the system prompt + tool definitions, bringing the 100K-user cost closer to $30-40K/mo.