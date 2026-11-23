# Coffee POS

A simple order-taking app for a coffee shop. One computer runs it, and any phone, tablet or laptop on the same Wi-Fi can take orders at the same time. All devices share one database, so orders and prices are always in sync.

## What it does

- **Take order** (`/`): tap a product's Hot/Cold size to add it, adjust quantities, optional customer name, total to pay, amount received (with quick cash buttons), and change. An order can't be completed if the cash received is short.
- **Products & prices** (`/admin`): edit prices in a grid like your spreadsheet, add, rename, reorder, hide or delete products. Leave a price blank if that size isn't sold. Changes reach every order screen within 30 seconds.
- **Sales reports** (`/reports`): daily (by month), monthly (by year) and annual sales, with orders, cups sold, average order and best sellers. There is also a list of each day's orders where you can void a mistaken order. Reports can be exported to CSV (opens in Excel) or printed.

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

## Your data and backups

All products, prices and orders are in one file: `data/coffee.db`. To back up, copy that file (best while the app is stopped). To restore, put it back. Deleting it resets the app to the original menu from the spreadsheet with no sales.

## Putting it online (optional)

If devices need to work from different places (not one Wi-Fi), host it on any service that runs Node.js with a persistent disk, for example a small VPS, Render or Railway with a volume mounted at `data/`. Set `ADMIN_PIN` to something private and use HTTPS. Run command: `node server.js`.

## Files

- `server.js`: the server, database and API (uses Node's built-in SQLite, no packages)
- `public/index.html`: order screen
- `public/admin.html`: products & prices
- `public/reports.html`: sales reports and orders list
- `public/app.css`, `public/common.js`: shared styles and helpers
