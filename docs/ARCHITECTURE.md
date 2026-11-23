# Coffee POS: Architecture

How the Coffee POS is put together and how requests move through it. Endpoint contracts, validation rules and configuration are in [`SYSTEM_SPEC.md`](SYSTEM_SPEC.md); product requirements are in the PRD; coding rules are in `CLAUDE.md`.

## 1. Summary

Coffee POS is a **single-process monolith**: one Node.js process serves the web pages, the JSON API and owns the only database file. Browsers are thin clients that render HTML and call the API. There is no build step, no framework and no npm dependency; everything uses Node built-ins (`node:http`, `node:sqlite`, `fetch`).

Key decisions:

| Decision | Reason | Consequence |
| --- | --- | --- |
| Node built-ins only | Shop owner installs nothing but Node; nothing to update or break | Hand-written router and static server |
| SQLite in one file | Zero setup, one file to back up | One writer process; no horizontal scaling |
| Synchronous `DatabaseSync` | Simple transactions with no interleaving on a single thread | Slow queries block all requests (fine at one-shop volume) |
| Server is the source of truth for prices | Browsers can be stale or tampered with | Each order re-reads prices and snapshots them |
| Local-time text timestamps | Reports become string prefix filters | `TZ` must be right when orders are taken |
| AI is an isolated, optional module | The till must work offline and never wait on a third party | AI routes sit behind the PIN, and only `ai.js` calls out |
| One shared PIN | Fits a single small shop | No per-user identity or audit trail |

## 2. System context

```mermaid
flowchart LR
    cashier["Cashier / barista<br/>phone or tablet"]
    owner["Owner<br/>PC, laptop or phone"]
    pos["Coffee POS<br/>Node.js server + SQLite"]
    openai["OpenAI API"]
    anthropic["Anthropic API"]

    cashier -- "order screen, recipes<br/>(no PIN)" --> pos
    owner -- "prices, reports, voids, AI<br/>(admin PIN)" --> pos
    pos -. "optional, admin only<br/>aggregated sales data" .-> openai
    pos -. "optional, admin only<br/>aggregated sales data" .-> anthropic
```

## 3. Components

```mermaid
flowchart TB
    subgraph Browser["Browser (any device)"]
        idx["index.html<br/>Order screen"]
        adm["admin.html<br/>Products, prices, recipes, AI settings"]
        rep["reports.html<br/>Reports, orders list, voids, CSV, AI"]
        common["common.js<br/>api(), peso(), esc(), requirePin()"]
        precipes["public/recipes.js<br/>Recipe viewer and editor"]
        idx & adm & rep --> common
        idx & adm --> precipes
    end

    subgraph Server["Node.js process (server.js)"]
        http["node:http server<br/>handle()"]
        static["Static file server<br/>public/ only"]
        router["API router"]
        auth["requireAdmin()<br/>X-Admin-Pin"]
        products["Products and prices<br/>listProducts / saveProducts"]
        orders["Orders<br/>createOrder / listOrders / void"]
        reports["Reports<br/>report()"]
        aictx["AI context builders<br/>summaryData / askContext<br/>(no customer names)"]
        recipes["recipes.js<br/>handleRecipes"]
        ai["ai.js<br/>resolve / chat / summarize / ask"]
    end

    db[("SQLite file<br/>DB_FILE, WAL")]
    llm["OpenAI / Anthropic"]

    common -- "fetch JSON" --> http
    Browser -- "GET pages" --> http
    http --> static
    http --> router
    router --> recipes
    router -- "open routes" --> products & orders
    router --> auth
    auth --> products & orders & reports & aictx
    aictx --> reports
    aictx --> ai
    products & orders & reports & recipes & aictx --> db
    ai -- "settings" --> db
    ai -. "HTTPS fetch, 60 s timeout" .-> llm
```

The order path (`index.html` → `GET /api/products`, `POST /api/orders`, `GET /api/recipes/:id`) has no edge to `ai.js` or the internet. Keep it that way.

### Module boundaries

- `server.js` owns the database handle and shared helpers and passes them to feature modules. A feature that grows gets its own module with a small hook, as `recipes.js` does with `setupRecipes(db, helpers)` returning a handler that answers `true` when it handled the request.
- `ai.js` has no database access. It receives a resolved config and plain data objects and returns text, so what reaches the provider is decided entirely in `server.js` (`summaryData`, `askContext`).
- Browser pages share only `common.js`, `recipes.js` and `app.css`; each page's logic is inline in its HTML.

## 4. Request pipeline

```mermaid
flowchart TD
    req["Incoming request"] --> api{"path starts<br/>with /api/ ?"}
    api -- no --> st["Map / → index.html,<br/>/admin, /reports → .html"]
    st --> safe{"inside public/ ?"}
    safe -- no --> e404["404"]
    safe -- yes --> file["Read file, send with MIME type"]
    api -- yes --> rc{"recipe route?"}
    rc -- yes --> rch["handleRecipes<br/>(PUT checks PIN itself)"]
    rc -- no --> open{"GET /api/products or<br/>POST /api/orders ?"}
    open -- yes --> openh["Handle, no PIN"]
    open -- no --> pin{"X-Admin-Pin<br/>= ADMIN_PIN ?"}
    pin -- no --> e401["401 Wrong admin PIN"]
    pin -- yes --> adminh["Admin, report, order list,<br/>void and AI routes"]
    adminh -- "no match" --> e404b["404"]
    rch & openh & adminh --> resp["send(): JSON, no-store"]
    rch & openh & adminh -. "throw HttpError / Error" .-> err["catch: { error } with status,<br/>500 logged"]
```

## 5. Data architecture

The full schema and column notes are in [SYSTEM_SPEC.md §5](SYSTEM_SPEC.md#5-data-model). Architecturally the tables split in two:

```mermaid
flowchart LR
    subgraph Menu["Current menu (mutable)"]
        products --- prices
        products --- recipes
    end
    subgraph Record["Sales record (append-only, status changes only)"]
        orders --- order_items
    end
    settings["settings<br/>(AI config)"]

    prices -- "read at moment of sale,<br/>copied as unit_price" --> order_items
    products -- "name and category copied" --> order_items
    order_items -- "reports and AI read only from here" --> rep(["Reports / AI"])
    orders --> rep
```

- **Snapshots, not joins.** Nothing in reports joins back to `products` or `prices`, so price edits, hides and deletes never change history.
- **Period by prefix.** `created_at` is local-time text; a day, month or year is a `LIKE 'prefix%'` range scan on `idx_orders_created`.
- **Migrations are start-up DDL.** `CREATE TABLE IF NOT EXISTS` on every start; changes must be additive.
- **Concurrency.** One process and a synchronous driver mean writes are serialised by the event loop. WAL lets reads proceed while a write commits. Every multi-row write is one `BEGIN … COMMIT` with no `await` inside it.

## 6. Key flows

### 6.1 Taking an order

```mermaid
sequenceDiagram
    autonumber
    actor C as Cashier
    participant B as index.html
    participant S as server.js
    participant D as SQLite

    B->>S: GET /api/products
    S->>D: SELECT active products, prices
    S-->>B: menu with prices
    C->>B: tap sizes, enter cash received
    Note over B: preview total and change<br/>(not trusted by server)
    C->>B: Complete order
    B->>S: POST /api/orders { items, received, customerName, expectedTotal }
    S->>D: SELECT product (active) and price per line
    alt product hidden or size not sold
        S-->>B: 400 "no longer available. Reload the page."
        B->>S: GET /api/products (reload)
    else server total differs from expectedTotal
        S-->>B: 409 "Prices were just updated. The new total is ₱X"
        B->>S: GET /api/products (reload, re-price cart)
    else received less than total
        S-->>B: 400 "Amount received is less than the total"
    else valid
        S->>D: BEGIN, INSERT orders, INSERT order_items (snapshots), COMMIT
        S->>D: SELECT order with items
        S-->>B: 201 saved order
        B-->>C: confirmation with order number and change
    end
```

### 6.2 Changing prices while counters are open

```mermaid
sequenceDiagram
    autonumber
    actor O as Owner
    participant A as admin.html
    participant S as server.js
    participant D as SQLite
    participant B as index.html (counter)

    O->>A: edit grid, Save changes
    A->>S: PUT /api/admin/products [whole list] + X-Admin-Pin
    S->>D: BEGIN, update/insert/delete products, rewrite prices, COMMIT
    S-->>A: 200 all products
    loop every 30 s and when the tab becomes visible
        B->>S: GET /api/products
        S-->>B: new prices
        Note over B: re-price cart lines,<br/>drop sizes no longer sold
    end
    Note over B,S: An order sent with the old total in between<br/>gets 409 (flow 6.1) and is re-checked.
```

### 6.3 Admin unlock and a report

```mermaid
sequenceDiagram
    autonumber
    actor O as Owner
    participant R as reports.html
    participant S as server.js
    participant D as SQLite

    O->>R: open /reports
    R->>R: requirePin(): PIN in sessionStorage?
    O->>R: enter PIN
    R->>S: POST /api/admin/check + X-Admin-Pin
    alt wrong PIN
        S-->>R: 401, PIN cleared, ask again
    else correct
        S-->>R: 200 { ok: true }
        R->>S: GET /api/reports?type=daily&month=YYYY-MM
        S->>D: 3 queries on paid orders with created_at LIKE 'YYYY-MM%'
        S-->>R: { rows, products, totals }
        R->>R: fill empty days, average order, bars, best sellers
    end
```

### 6.4 Voiding an order

```mermaid
sequenceDiagram
    actor O as Owner
    participant R as reports.html (Orders list)
    participant S as server.js
    participant D as SQLite
    R->>S: GET /api/orders?date=YYYY-MM-DD
    S-->>R: day's orders incl. voided
    O->>R: Void order 42
    R->>S: POST /api/orders/42/void
    S->>D: UPDATE orders SET status = 'void' WHERE id = 42
    S-->>R: order with status void
    Note over S,D: Row kept. Reports and AI filter status = 'paid'.<br/>Unvoid sets it back to 'paid'.
```

### 6.5 AI summary (optional)

```mermaid
sequenceDiagram
    autonumber
    actor O as Owner
    participant R as reports.html
    participant S as server.js
    participant D as SQLite
    participant AI as ai.js
    participant P as OpenAI / Anthropic

    R->>S: GET /api/admin/ai
    S-->>R: { enabled, ... } (AI buttons hidden if off)
    O->>R: AI summary
    R->>S: POST /api/ai/summary { type, month | year } + PIN
    S->>D: report() for period and previous period, busy hours
    Note over S: summaryData(): aggregates and product names only,<br/>never customer_name
    S->>AI: summarize(config, data)
    AI->>P: HTTPS POST, 60 s timeout
    alt provider answers
        P-->>AI: text
        AI-->>S: text
        S-->>R: 200 { text }
    else rejected, unreachable or timed out
        AI-->>S: AiError
        S-->>R: 502 / 504 { error } shown on screen
    end
```

"Ask about your sales" (`POST /api/ai/ask`) follows the same path with `askContext()` and up to 6 earlier messages.

### 6.6 Start-up

```mermaid
flowchart TD
    a["node server.js"] --> b["TZ defaults to Asia/Manila"]
    b --> c["Read PORT, ADMIN_PIN, DB_FILE"]
    c --> d["mkdir dirname(DB_FILE)"]
    d --> e["Open DatabaseSync, WAL, foreign keys"]
    e --> f["CREATE TABLE IF NOT EXISTS ..."]
    f --> g{"products empty?"}
    g -- yes --> h["Seed six-product menu"]
    g -- no --> i
    h --> i["setupRecipes: create table,<br/>seed starter recipes if table is new"]
    i --> j["listen(PORT)"]
    j --> k["Log URLs, PIN warning, AI status"]
```

## 7. Deployment

The same build runs on a shop computer or on Railway. Only environment variables differ.

### 7.1 Shop LAN

```mermaid
flowchart LR
    subgraph Shop["Shop Wi-Fi (no internet needed)"]
        p1["Counter phone"]
        p2["Counter tablet"]
        pc["Owner's PC<br/>browser"]
        subgraph Host["Shop PC"]
            node["node server.js<br/>:3000"]
            file[("data/coffee.db")]
            node --- file
        end
        p1 & p2 & pc -- "http://192.168.x.x:3000" --> node
    end
    node -. "only if AI is on" .-> net(("Internet:<br/>OpenAI / Anthropic"))
```

### 7.2 Railway (current hosting)

```mermaid
flowchart LR
    subgraph Devices["Any location"]
        d1["Counter phones / tablets"]
        d2["Owner's devices"]
    end
    subgraph Railway["Railway project"]
        edge["Railway edge<br/>HTTPS, *.up.railway.app"]
        subgraph Svc["Service: Coffee-Shop (1 replica)"]
            proc["npm start → node server.js<br/>listens on $PORT"]
        end
        vol[("Volume mounted at /data<br/>/data/coffee.db + WAL")]
        vars["Variables:<br/>DB_FILE=/data/coffee.db<br/>ADMIN_PIN, PORT, TZ<br/>(optional AI keys)"]
        proc --- vol
        vars -.-> proc
    end
    gh["GitHub<br/>toniedolor21-dotcom/Coffee-Shop main"]

    d1 & d2 -- HTTPS --> edge --> proc
    gh -- "push to main → build and deploy<br/>(when auto-deploy is on)" --> Svc
    proc -. "optional AI calls" .-> llm(("OpenAI / Anthropic"))
```

Railway settings live in the Railway dashboard, not in the repo (no `railway.json`, `Dockerfile` or `Procfile`).

| Setting | Value | Why |
| --- | --- | --- |
| Start command | `npm start` (detected from `package.json`) | Runs `node server.js` |
| Node version | 22.13 or newer | `node:sqlite` without a flag; set by `engines.node` |
| Volume | Mounted at `/data` | The container file system is wiped on every deploy |
| `DB_FILE` | `/data/coffee.db` | Puts the database, WAL and SHM files on the volume |
| `TZ` | `Asia/Manila` | Containers default to UTC; the code also defaults it, but set it explicitly |
| `ADMIN_PIN` | Long, private value | The URL is public; there is no lockout on wrong PINs |
| `PORT` | Set by Railway | The server reads it; no host binding needed |
| Replicas | Exactly 1 | SQLite has one writer, and a volume attaches to one service instance |

Operational consequences of hosting:

- **Internet becomes a hard dependency** for the counters. If the shop's connection drops, orders stop. Running locally on the LAN is the fallback; the two databases are separate files and do not sync.
- **Deploys restart the process.** Expect a short outage on each deploy; avoid deploying during opening hours. Committed orders are safe on the volume.
- **Backups** are the volume's (Railway volume backups) or a copy of `/data/coffee.db` taken while the service is stopped.
- **Do not scale out.** More replicas would either fail to mount the volume or each get their own database.
- **No health check endpoint.** If one is configured, `GET /api/products` is a suitable path.
- The start-up log's "Other devices on the same Wi-Fi" line shows container addresses on Railway and can be ignored.

## 8. Cross-cutting concerns

| Concern | Approach |
| --- | --- |
| Error handling | Handlers throw `HttpError(status, message)`; one `catch` in `createServer` turns it into `{ error }`. Unknown errors are logged and returned as `500 "Server error"`. Messages are written for staff. |
| Money | Floating-point `REAL`, rounded with `money()` at every server-side calculation; shown with `peso()` (`en-PH`). |
| Time | Process `TZ` decides order timestamps and report periods. The reports page derives "today" from the browser clock. |
| Offline | No external assets. The only outbound calls are in `ai.js`. |
| Privacy | Customer names stay in `orders`; AI receives aggregates. |
| Caching | API responses `Cache-Control: no-store`. Static files have no caching headers. |
| Observability | Start-up log and 500 errors to stdout/stderr (Railway's log view). No request log or metrics. |
| Testing | No automated tests. Manual checks against a throwaway `DB_FILE`. |

## 9. Extension points and limits

- **New feature module:** follow `recipes.js`: `setupX(db, helpers)` creates its tables additively and returns a handler, called from `handle()` before or after `requireAdmin` depending on whether it needs the PIN.
- **New report:** add a query on `orders`/`order_items` filtered by `status = 'paid'` and a `created_at` prefix; never read `prices`.
- **New AI data:** add it in `summaryData()`/`askContext()` only, as aggregates without `customer_name`.
- **New AI provider:** add an entry to `ai.js` `PROVIDERS` and a branch in `chat()`; settings keys follow `ai_<id>_key` / `ai_<id>_model`.
- **Limits of this design:** one shop and one server; one shared PIN; no offline mode on client devices; no audit log. The PRD's future-ideas table covers which of these to address and in what order.
