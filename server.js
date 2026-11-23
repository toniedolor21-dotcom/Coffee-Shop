// Coffee POS server: zero dependencies, Node.js 22.13+ (uses built-in node:sqlite).
// Run: node server.js   then open http://<this-computer-ip>:3000 on any device.
process.env.TZ = process.env.TZ || 'Asia/Manila';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PIN = String(process.env.ADMIN_PIN || '1234');
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'coffee.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

const TEMPS = ['Hot', 'Cold'];
const SIZES = ['Small', 'Medium', 'Large'];

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'Coffee',
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS prices (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    temp TEXT NOT NULL,
    size TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (product_id, temp, size)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,          -- local time 'YYYY-MM-DD HH:MM:SS'
    customer_name TEXT,
    total REAL NOT NULL,
    received REAL NOT NULL,
    change_due REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid' -- 'paid' or 'void'
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    product_name TEXT NOT NULL,        -- snapshot at time of sale
    category TEXT,
    temp TEXT NOT NULL,
    size TEXT NOT NULL,
    unit_price REAL NOT NULL,          -- snapshot at time of sale
    qty INTEGER NOT NULL,
    line_total REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
`);

// Seed from "Coffee Product and Price.xlsx" on first run.
if (db.prepare('SELECT COUNT(*) n FROM products').get().n === 0) {
  const seed = [
    // name, Hot S/M/L, Cold S/M/L
    ['Americano', 60, 75, 90, 70, 90, 100],
    ['Cappuccino', 65, 95, 105, 70, 90, 100],
    ['Mocha', 100, 110, 120, 110, 120, 130],
    ['Spanish Latte', 110, 115, 125, 115, 130, 150],
    ['Caramel Macchiato', 110, 115, 125, 115, 130, 150],
    ['Latte', 100, 110, 120, 110, 120, 130],
  ];
  const insP = db.prepare('INSERT INTO products (category, name, sort) VALUES (?, ?, ?)');
  const insPrice = db.prepare('INSERT INTO prices (product_id, temp, size, price) VALUES (?, ?, ?, ?)');
  db.exec('BEGIN');
  seed.forEach(([name, ...p], i) => {
    const id = insP.run('Coffee', name, i).lastInsertRowid;
    TEMPS.forEach((t, ti) => SIZES.forEach((s, si) => insPrice.run(id, t, s, p[ti * 3 + si])));
  });
  db.exec('COMMIT');
}

// ---------- helpers ----------
const money = (n) => Math.round(Number(n) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
function localNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1e6) throw new HttpError(413, 'Request too large');
  }
  try { return data ? JSON.parse(data) : {}; } catch { throw new HttpError(400, 'Invalid JSON'); }
}
function requireAdmin(req) {
  if (req.headers['x-admin-pin'] !== ADMIN_PIN) throw new HttpError(401, 'Wrong admin PIN');
}

const handleRecipes = require('./recipes').setupRecipes(db, { HttpError, send, readJson, requireAdmin, TEMPS, SIZES });

function listProducts(includeInactive) {
  const products = db.prepare(
    `SELECT id, category, name, active, sort FROM products ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort, id`
  ).all();
  const prices = db.prepare('SELECT product_id, temp, size, price FROM prices').all();
  const byId = new Map(products.map((p) => [p.id, { ...p, active: !!p.active, prices: {} }]));
  for (const pr of prices) {
    const p = byId.get(pr.product_id);
    if (p) p.prices[`${pr.temp}|${pr.size}`] = pr.price;
  }
  return [...byId.values()];
}

function saveProducts(list) {
  if (!Array.isArray(list)) throw new HttpError(400, 'Expected a list of products');
  const upd = db.prepare('UPDATE products SET category = ?, name = ?, active = ?, sort = ? WHERE id = ?');
  const ins = db.prepare('INSERT INTO products (category, name, active, sort) VALUES (?, ?, ?, ?)');
  const delPrices = db.prepare('DELETE FROM prices WHERE product_id = ?');
  const insPrice = db.prepare('INSERT INTO prices (product_id, temp, size, price) VALUES (?, ?, ?, ?)');
  const del = db.prepare('DELETE FROM products WHERE id = ?');
  db.exec('BEGIN');
  try {
    list.forEach((p, i) => {
      if (p.deleted) { if (p.id) del.run(p.id); return; }
      const name = String(p.name || '').trim();
      if (!name) throw new HttpError(400, `Product on row ${i + 1} has no name`);
      const category = String(p.category || 'Coffee').trim() || 'Coffee';
      const active = p.active === false ? 0 : 1;
      let id = p.id;
      if (id) upd.run(category, name, active, i, id);
      else id = ins.run(category, name, active, i).lastInsertRowid;
      delPrices.run(id);
      for (const t of TEMPS) for (const s of SIZES) {
        const v = p.prices?.[`${t}|${s}`];
        if (v === '' || v === null || v === undefined) continue;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `Invalid price for ${name} ${t} ${s}`);
        insPrice.run(id, t, s, money(n));
      }
    });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function getOrder(id) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) return null;
  o.items = db.prepare('SELECT product_name, temp, size, unit_price, qty, line_total FROM order_items WHERE order_id = ? ORDER BY id').all(id);
  return o;
}

function createOrder(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new HttpError(400, 'Order has no items');
  const getProduct = db.prepare('SELECT id, name, category FROM products WHERE id = ? AND active = 1');
  const getPrice = db.prepare('SELECT price FROM prices WHERE product_id = ? AND temp = ? AND size = ?');
  // The price is read from the database at the moment of sale and stored on the order line,
  // so later price changes never alter past orders or reports.
  const lines = items.map((it) => {
    const p = getProduct.get(Number(it.productId));
    if (!p) throw new HttpError(400, 'A product in the order is no longer available. Reload the page.');
    const pr = getPrice.get(p.id, String(it.temp), String(it.size));
    if (!pr) throw new HttpError(400, `${p.name} ${it.temp} ${it.size} is no longer available. Reload the page.`);
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1 && qty <= 999)) throw new HttpError(400, 'Invalid quantity');
    return { ...p, temp: String(it.temp), size: String(it.size), unit: pr.price, qty, line: money(pr.price * qty) };
  });
  const total = money(lines.reduce((s, l) => s + l.line, 0));
  if (body.expectedTotal !== undefined && money(body.expectedTotal) !== total) {
    throw new HttpError(409, `Prices were just updated. The new total is ₱${total.toFixed(2)}. Please check the order and try again.`);
  }
  const received = money(body.received);
  if (!Number.isFinite(received) || received < total) throw new HttpError(400, 'Amount received is less than the total');
  const change = money(received - total);
  const customer = String(body.customerName || '').trim().slice(0, 100) || null;

  let orderId;
  db.exec('BEGIN');
  try {
    orderId = db.prepare(
      'INSERT INTO orders (created_at, customer_name, total, received, change_due) VALUES (?, ?, ?, ?, ?)'
    ).run(localNow(), customer, total, received, change).lastInsertRowid;
    const insItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, product_name, category, temp, size, unit_price, qty, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of lines) insItem.run(orderId, l.id, l.name, l.category, l.temp, l.size, l.unit, l.qty, l.line);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return getOrder(orderId);
}

// Reports. Timestamps are local-time text, so a period is a prefix: YYYY-MM-DD, YYYY-MM or YYYY.
function report(q) {
  const type = q.get('type') || 'daily';
  let len, prefix;
  if (type === 'daily') {          // one row per day of the chosen month
    prefix = q.get('month') || localNow().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(prefix)) throw new HttpError(400, 'Bad month');
    len = 10;
  } else if (type === 'monthly') { // one row per month of the chosen year
    prefix = q.get('year') || localNow().slice(0, 4);
    if (!/^\d{4}$/.test(prefix)) throw new HttpError(400, 'Bad year');
    len = 7;
  } else if (type === 'annual') {  // one row per year
    prefix = ''; len = 4;
  } else throw new HttpError(400, 'Unknown report type');

  const where = `o.status = 'paid' AND o.created_at LIKE ? || '%'`;
  const rows = db.prepare(
    `SELECT substr(o.created_at, 1, ${len}) AS period, COUNT(*) AS orders, SUM(o.total) AS sales
     FROM orders o WHERE ${where} GROUP BY period ORDER BY period`
  ).all(prefix);
  const cups = new Map(db.prepare(
    `SELECT substr(o.created_at, 1, ${len}) AS period, SUM(i.qty) AS cups
     FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${where} GROUP BY period`
  ).all(prefix).map((r) => [r.period, r.cups]));
  for (const r of rows) { r.sales = money(r.sales); r.cups = cups.get(r.period) || 0; }

  const products = db.prepare(
    `SELECT i.product_name AS name, i.temp, i.size, SUM(i.qty) AS qty, SUM(i.line_total) AS sales
     FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${where}
     GROUP BY i.product_name, i.temp, i.size ORDER BY sales DESC, qty DESC`
  ).all(prefix);
  const totals = rows.reduce((t, r) => ({ orders: t.orders + r.orders, sales: money(t.sales + r.sales), cups: t.cups + r.cups }),
    { orders: 0, sales: 0, cups: 0 });
  return { type, prefix, rows, products, totals };
}

function listOrders(q) {
  const date = q.get('date') || localNow().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Bad date');
  const orders = db.prepare(`SELECT * FROM orders WHERE created_at LIKE ? || '%' ORDER BY id DESC`).all(date);
  const items = db.prepare('SELECT product_name, temp, size, unit_price, qty, line_total FROM order_items WHERE order_id = ? ORDER BY id');
  for (const o of orders) o.items = items.all(o.id);
  return orders;
}

// ---------- routing ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const m = req.method;

  if (p.startsWith('/api/')) {
    if (await handleRecipes(req, res, url)) return;
    if (m === 'GET' && p === '/api/products') return send(res, 200, listProducts(false));
    if (m === 'POST' && p === '/api/orders') return send(res, 201, createOrder(await readJson(req)));
    // Everything below needs the admin PIN.
    requireAdmin(req);
    if (m === 'POST' && p === '/api/admin/check') return send(res, 200, { ok: true });
    if (m === 'GET' && p === '/api/admin/products') return send(res, 200, listProducts(true));
    if (m === 'PUT' && p === '/api/admin/products') { saveProducts(await readJson(req)); return send(res, 200, listProducts(true)); }
    if (m === 'GET' && p === '/api/orders') return send(res, 200, listOrders(url.searchParams));
    if (m === 'GET' && p === '/api/reports') return send(res, 200, report(url.searchParams));
    const vm = p.match(/^\/api\/orders\/(\d+)\/(void|unvoid)$/);
    if (m === 'POST' && vm) {
      const r = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(vm[2] === 'void' ? 'void' : 'paid', Number(vm[1]));
      if (!r.changes) throw new HttpError(404, 'Order not found');
      return send(res, 200, getOrder(Number(vm[1])));
    }
    throw new HttpError(404, 'Not found');
  }

  // static files
  let file = p === '/' ? '/index.html' : p;
  if (['/admin', '/reports'].includes(file)) file += '.html';
  const full = path.normalize(path.join(PUBLIC_DIR, file));
  if (!full.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(404, 'Not found');
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (!(e instanceof HttpError)) console.error(e);
    send(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'Server error' });
  });
}).listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => `http://${n.address}:${PORT}`);
  console.log(`Coffee POS running on http://localhost:${PORT}`);
  if (lan.length) console.log(`Other devices on the same Wi-Fi can open: ${lan.join('  ')}`);
  if (ADMIN_PIN === '1234') console.log('Admin PIN is the default 1234. Set ADMIN_PIN to change it.');
});
