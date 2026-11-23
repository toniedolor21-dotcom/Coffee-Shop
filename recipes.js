// Recipes: ingredients and preparation steps for each product, per Hot/Cold.
// Ingredient amounts can differ per size (Small/Medium/Large).
// Kept in its own module so server.js only needs a two-line hook.

const SEED = require('./recipes-seed');

function setupRecipes(db, { HttpError, send, readJson, requireAdmin, TEMPS, SIZES }) {
  const existed = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'recipes'").get();
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      temp TEXT NOT NULL,                 -- 'Hot' or 'Cold'
      ingredients TEXT NOT NULL DEFAULT '[]', -- JSON [{ item, amounts: { Small, Medium, Large } }]
      steps TEXT NOT NULL DEFAULT '[]',       -- JSON ["step 1", "step 2", ...]
      notes TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (product_id, temp)
    );
  `);

  // Starter recipes, added once when the recipes table is first created
  // (for existing shops too), matched to products by name.
  if (!existed) {
    const find = db.prepare('SELECT id FROM products WHERE lower(name) = lower(?)');
    db.exec('BEGIN');
    try {
      for (const [name, byTemp] of Object.entries(SEED)) {
        const p = find.get(name);
        if (p) writeRecipe(p.id, byTemp);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  function clean(r, label) {
    const str = (v, max) => String(v ?? '').trim().slice(0, max);
    const ingredients = (Array.isArray(r?.ingredients) ? r.ingredients : []).map((ing) => {
      const amounts = {};
      for (const s of SIZES) { const a = str(ing?.amounts?.[s], 60); if (a) amounts[s] = a; }
      return { item: str(ing?.item, 100), amounts };
    }).filter((ing) => ing.item || Object.keys(ing.amounts).length);
    for (const ing of ingredients) if (!ing.item) throw new HttpError(400, `${label}: an ingredient has amounts but no name`);
    const steps = (Array.isArray(r?.steps) ? r.steps : []).map((s) => str(s, 500)).filter(Boolean);
    if (ingredients.length > 50 || steps.length > 50) throw new HttpError(400, `${label}: too many lines`);
    return { ingredients, steps, notes: str(r?.notes, 1000) };
  }

  function writeRecipe(productId, byTemp) {
    db.prepare('DELETE FROM recipes WHERE product_id = ?').run(productId);
    const ins = db.prepare('INSERT INTO recipes (product_id, temp, ingredients, steps, notes) VALUES (?, ?, ?, ?, ?)');
    for (const t of TEMPS) {
      const r = clean(byTemp?.[t], t);
      if (!r.ingredients.length && !r.steps.length && !r.notes) continue;
      ins.run(productId, t, JSON.stringify(r.ingredients), JSON.stringify(r.steps), r.notes);
    }
  }

  function getRecipe(productId) {
    const out = {};
    for (const row of db.prepare('SELECT temp, ingredients, steps, notes FROM recipes WHERE product_id = ?').all(productId)) {
      out[row.temp] = { ingredients: JSON.parse(row.ingredients), steps: JSON.parse(row.steps), notes: row.notes };
    }
    return out;
  }

  const productExists = db.prepare('SELECT 1 FROM products WHERE id = ?');

  // Returns true when the request was a recipe route and has been answered.
  return async function handleRecipes(req, res, url) {
    const m = url.pathname.match(/^\/api\/(admin\/)?recipes\/(\d+)$/);
    if (!m) return false;
    const id = Number(m[2]);
    if (!productExists.get(id)) throw new HttpError(404, 'Product not found');
    if (!m[1] && req.method === 'GET') { send(res, 200, getRecipe(id)); return true; }   // staff, no PIN
    if (m[1] && req.method === 'PUT') {
      requireAdmin(req);
      const body = await readJson(req);
      db.exec('BEGIN');
      try { writeRecipe(id, body); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
      send(res, 200, getRecipe(id));
      return true;
    }
    throw new HttpError(404, 'Not found');
  };
}

module.exports = { setupRecipes };
