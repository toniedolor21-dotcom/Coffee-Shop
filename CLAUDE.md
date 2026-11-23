# CLAUDE.md

Guidance for AI coding assistants working in this repository. `.cursorrules` holds the same rules for Cursor; keep the two files in step when either changes.

## What this is

Coffee POS: an order-taking app for one small coffee shop in the Philippines. One computer runs the server and any phone, tablet or laptop on the same Wi-Fi uses it in a browser. It has an order screen, a products & prices admin page with recipes, sales reports (daily, monthly, annual) with order voiding, and an optional AI assistant for the owner. The users are non-technical shop staff and the owner.

## Run it

- Needs **Node.js 22.13 or newer**. There are **no npm dependencies** and no build step.
- Start: `node server.js` (or `npm start`; on Windows, `start-windows.bat`). Open `http://localhost:3000`.
- Settings are environment variables: `PORT` (3000), `ADMIN_PIN` (`1234`), `TZ` (`Asia/Manila`), `DB_FILE` (`data/coffee.db`), and for the AI assistant `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_PROVIDER` (`openai`, `anthropic`, `off`), `AI_MODEL`.
- For a throwaway test database: `DB_FILE=/tmp/test.db PORT=3001 node server.js`. Never test against a shop's real `data/coffee.db`.
- There is no test suite or linter. Check changes by running the server and using the pages, or with `curl` against the API (send `X-Admin-Pin` for admin routes).

## Structure

| File | Role |
| --- | --- |
| `server.js` | HTTP server (`node:http`), SQLite schema and first-run seed, products, orders, reports, AI routes, static files |
| `recipes.js` | Recipe table, starter-recipe seeding and `/api/recipes` routes, hooked in from `server.js` via `setupRecipes(db, helpers)` |
| `recipes-seed.js` | Starter recipes for the original menu (placeholders the shop should adjust) |
| `ai.js` | Optional AI assistant: provider config, OpenAI and Anthropic calls with built-in `fetch`, summary and Q&A prompts |
| `public/index.html` | Order screen (no PIN) |
| `public/admin.html` | Products & prices, recipe editor, AI settings (PIN) |
| `public/reports.html` | Sales reports, daily order list with void/unvoid, CSV/print, AI summary and questions (PIN) |
| `public/common.js` | Shared browser helpers: `api()`, `peso()`, `esc()`, `$()`, `toast()`, `header()`, `requirePin()` |
| `public/recipes.js` | Recipe viewer (order screen) and editor (admin) dialogs |
| `public/app.css` | Shared styles |

Pages are plain HTML with inline `<script>` blocks that load `common.js` first. No framework, no bundler.

## Data

One SQLite file, `data/coffee.db`, opened with `node:sqlite` (`DatabaseSync`), WAL mode, foreign keys on. Tables are created with `CREATE TABLE IF NOT EXISTS` at startup.

- `products` (id, category, name, active, sort) and `prices` (product_id, temp, size, price). Temps are `Hot`/`Cold`, sizes `Small`/`Medium`/`Large`. A missing price row means that size is not sold. The six-product menu is seeded only when `products` is empty.
- `orders` (created_at, customer_name, total, received, change_due, status `paid`/`void`). `created_at` is **local-time text** `YYYY-MM-DD HH:MM:SS`, so reports group by string prefix (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`).
- `order_items` stores `product_name`, `category`, `unit_price` and `line_total` as **snapshots at the time of sale**.
- `recipes` (product_id, temp, ingredients JSON, steps JSON, notes), created by `recipes.js`.
- `settings` (key, value): AI settings with keys prefixed `ai_`, including API keys.

Schema changes must be additive and safe on an existing shop database (new tables or nullable/defaulted columns, guarded so startup works on both old and new files). Never drop or rewrite existing sales data.

## API

- Open (no PIN): `GET /api/products`, `POST /api/orders`, `GET /api/recipes/:id`.
- Everything else needs the `X-Admin-Pin` header: `/api/admin/*`, `GET /api/orders?date=`, `GET /api/reports?type=daily|monthly|annual`, `POST /api/orders/:id/void|unvoid`, `/api/ai/*`, `PUT /api/admin/recipes/:id`.
- Errors are thrown as `HttpError(status, message)` and returned as `{ error }`. Messages are shown to staff, so write them in plain English that says what to do.

## Rules

1. **The order screen never depends on AI.** `public/index.html`, `GET /api/products` and `POST /api/orders` must not call `ai.js` or any outside service, and must work the same with no API key, no internet, or a failing AI provider. AI is admin-only (behind the PIN) and optional.
2. **Prices are saved on each order.** `createOrder` reads the current price from the database at the moment of sale and stores it on the order line. Never compute past totals or reports from the current `prices` table, and never trust a price sent by the browser. Keep the `expectedTotal` check that rejects an order when prices changed mid-sale.
3. **Works offline.** The app runs on a shop LAN without internet. No CDNs, web fonts, external scripts or images, analytics, or remote calls outside the optional AI assistant. Inline or bundle everything in `public/`.
4. **No new dependencies.** Use Node built-ins (`node:http`, `node:sqlite`, `fetch`) and plain browser JavaScript. Adding an npm package, framework or build step needs the owner's explicit approval.
5. **No secrets or data in git.** Never commit `data/`, `*.db` files, API keys, or a real admin PIN. `.gitignore` already excludes `data/` and `*.db*`; keep it that way. API keys live only in the `settings` table or environment variables and are never sent back to the browser (only `maskKey()` hints).
6. **Customer names never go to the AI.** Only aggregated totals, product names, prices and quantities are sent. Keep `summaryData()` and `askContext()` free of `customer_name`.
7. **Money:** pesos, rounded with `money()` to 2 decimals on the server; displayed with `peso()` as `₱1,250.00`. Validate quantities and amounts on the server.
8. **Voided orders** stay in the database with `status = 'void'` and are excluded from every report and AI figure (`status = 'paid'` filters).
9. **Escape user text** with `esc()` before putting it in HTML.
10. **Keep it simple for staff.** Large touch targets, plain wording, no jargon in the UI. The order screen must stay fast and usable on a phone.

## Conventions

- CommonJS (`require`), 2-space indent, single quotes, semicolons, compact functions; match the style of the surrounding code.
- Use prepared statements with `?` parameters for all SQL. Wrap multi-row writes in `BEGIN`/`COMMIT` with `ROLLBACK` on error.
- Keep features in their own module with a small hook into `server.js` when they grow (as `recipes.js` and `ai.js` do).
- Default AI models are set in `ai.js` `PROVIDERS` (`gpt-5-mini`, `claude-haiku-5-5`). Saved admin settings win over environment variables.
- Update `README.md` when behaviour, settings or files change. It is written for the shop owner, so keep it non-technical.
