# Coffee POS

A simple order-taking app for a coffee shop. One computer runs it, and any phone, tablet or laptop on the same Wi-Fi can take orders at the same time. All devices share one database, so orders and prices are always in sync.

## What it does

- **Take order** (`/`): tap a product's Hot/Cold size to add it, adjust quantities, optional customer name, total to pay, amount received (with quick cash buttons), and change. An order can't be completed if the cash received is short.
- **Products & prices** (`/admin`): edit prices in a grid like your spreadsheet, add, rename, reorder, hide or delete products. Leave a price blank if that size isn't sold. Changes reach every order screen within 30 seconds.
- **Recipes**: every product has a **Recipe** button on the order screen showing its ingredients (amounts per size) and how to make it, separately for Hot and Cold. Staff don't need the PIN to view them. In a cart line, **Recipe** highlights that exact size. Admins edit recipes with the **Recipe** button in Products & prices. The original menu comes with starter recipes; these are placeholders, so check and adjust them to your shop's real recipes.
- **Sales reports** (`/reports`): daily (by month), monthly (by year) and annual sales, with orders, cups sold, average order and best sellers. There is also a list of each day's orders where you can void a mistaken order. Reports can be exported to CSV (opens in Excel) or printed.

- **AI assistant** (optional, on Sales reports): a one-button AI summary of the report you are viewing, and an "Ask about your sales" box for questions like "What sold best last week?". Works with OpenAI (default) or Claude. It is off until you add an API key, and the order screen never uses it.

Every order stores the price at the time of sale, so changing a price never changes past orders or reports.

Products & prices and Sales reports need the **admin PIN** (default `1234`). The order screen does not.

## Running it

You need **Node.js 22.13 or newer** (free, from https://nodejs.org, choose the "LTS" version). Nothing else needs installing.

1. Copy the `coffee-pos` folder to the computer that will act as the server (the shop's PC or laptop).
2. Open a terminal (Windows: Command Prompt or PowerShell) in that folder and run:

   ```
   node server.js
   ```

   (or `npm start`). On Windows you can also double-click `start-windows.bat`.
3. Open `http://localhost:3000` on that computer. The terminal also prints an address like `http://192.168.1.20:3000`. Open that address on the other phones and tablets (they must be on the same Wi-Fi). Tip: add it to the home screen.

Keep the terminal window open while the shop is open. Closing it stops the app; data is kept.

### Change the admin PIN

Windows (Command Prompt):
```
set ADMIN_PIN=4826 && node server.js
```
Mac / Linux:
```
ADMIN_PIN=4826 node server.js
```
(`start-windows.bat` has a line where you can set it.)

Other settings: `PORT` (default 3000), `TZ` (default `Asia/Manila`), `DB_FILE` (default `data/coffee.db`).

## AI assistant (optional)

The app works fully offline without it. To turn it on you need internet and an API key:

- OpenAI: create a key at https://platform.openai.com/api-keys
- Claude: create a key at https://console.anthropic.com

Then open **Products & prices**, scroll to **AI assistant**, choose the provider, paste the key and press **Save**. Use **Test connection** to check it. The key is stored only in `data/coffee.db` on the server computer. Leave Model blank to use the default (`gpt-5-mini` for OpenAI, `claude-haiku-5-5` for Claude).

You can set it with environment variables instead (settings saved on the Admin page take priority):

```
set OPENAI_API_KEY=sk-... && node server.js
```

Variables: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_PROVIDER` (`openai`, `anthropic` or `off`), `AI_MODEL`.

What is sent to the AI: sales totals by day, month and year, product names, prices and quantities, and order counts by hour. Customer names are never sent. Each summary or question costs a small amount on your provider account, usually well under ₱1.

## Your data and backups

All products, prices, recipes and orders are in one file: `data/coffee.db`. To back up, copy that file (best while the app is stopped). To restore, put it back. Deleting it resets the app to the original menu from the spreadsheet with no sales.

## Putting it online (optional)

If devices need to work from different places (not one Wi-Fi), host it on any service that runs Node.js with a persistent disk, for example a small VPS, Render or Railway with a volume mounted at `data/`. Set `ADMIN_PIN` to something private and use HTTPS. Run command: `node server.js`.

## Files

- `server.js`: the server, database and API (uses Node's built-in SQLite, no packages)
- `public/index.html`: order screen
- `public/admin.html`: products & prices
- `ai.js`: optional AI assistant (OpenAI or Claude, built-in fetch, no packages)
- `public/reports.html`: sales reports, orders list and the AI summary and questions
- `recipes.js`, `recipes-seed.js`: recipe storage and API, and the starter recipes
- `public/recipes.js`: recipe viewer and editor
- `public/app.css`, `public/common.js`: shared styles and helpers
