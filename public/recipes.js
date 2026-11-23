// Recipe viewer (order screen, no PIN) and recipe editor (Products & prices).
// Needs common.js loaded first.

// canClose() can return false to keep the dialog open (e.g. unsaved edits).
function recipeDialog(html, canClose = () => true) {
  const d = document.createElement('dialog');
  d.className = 'recipe-dialog';
  d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if ((e.target === d || e.target.closest('[data-close]')) && canClose()) d.close(); });
  d.addEventListener('cancel', (e) => { if (!canClose()) e.preventDefault(); });
  d.showModal();
  return d;
}

// Sizes a product sells for a temperature (falls back to all sizes).
function recipeSizes(product, t) {
  const sold = SIZES.filter((s) => product.prices?.[`${t}|${s}`] !== undefined);
  return sold.length ? sold : SIZES;
}

// Opens the recipe for a product. Optional pick = { temp, size } highlights a cart line's size.
async function showRecipe(product, pick = {}) {
  let recipe;
  try { recipe = await api(`/api/recipes/${product.id}`); }
  catch (e) { return toast('Could not load recipe: ' + e.message, true); }
  const sold = TEMPS.filter((t) => SIZES.some((s) => product.prices?.[`${t}|${s}`] !== undefined));
  const temps = TEMPS.filter((t) => recipe[t] || sold.includes(t));
  let temp = temps.includes(pick.temp) ? pick.temp : (temps.find((t) => recipe[t]) || temps[0] || 'Hot');

  const d = recipeDialog(`
    <div class="row recipe-head"><h2 style="margin:0">${esc(product.name)}</h2><span class="spacer"></span>
      <button data-close aria-label="Close">✕</button></div>
    <div class="tabs" id="rTabs">${temps.map((t) => `<button data-t="${t}">${t}</button>`).join('')}</div>
    <div id="rBody"></div>`);

  function render() {
    d.querySelectorAll('#rTabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === temp));
    const r = recipe[temp];
    const body = $('#rBody', d);
    if (!r) { body.innerHTML = `<p class="muted">No ${temp.toLowerCase()} recipe yet. An admin can add one in Products &amp; prices.</p>`; return; }
    const sizes = recipeSizes(product, temp);
    const hl = (s) => (pick.temp === temp && pick.size === s ? ' class="hl"' : '');
    body.innerHTML = `
      ${r.ingredients.length ? `<h3>Ingredients</h3>
      <table class="recipe-ing"><thead><tr><th></th>${sizes.map((s) => `<th${hl(s)}>${s}</th>`).join('')}</tr></thead>
        <tbody>${r.ingredients.map((ing) => `<tr><td>${esc(ing.item)}</td>${sizes.map((s) =>
          `<td${hl(s)}>${esc(ing.amounts[s] || '–')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
      ${r.steps.length ? `<h3>How to make it</h3><ol class="recipe-steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      ${r.notes ? `<h3>Notes</h3><p style="white-space:pre-line;margin:0">${esc(r.notes)}</p>` : ''}`;
  }
  $('#rTabs', d).addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (b) { temp = b.dataset.t; render(); } });
  render();
}

// Admin editor. Saves straight away with its own Save button (separate from the price grid).
async function editRecipe(product) {
  let recipe;
  try { recipe = await api(`/api/recipes/${product.id}`); }
  catch (e) { return toast('Could not load recipe: ' + e.message, true); }
  const blank = () => ({ ingredients: [], steps: [], notes: '' });
  const data = Object.fromEntries(TEMPS.map((t) => [t, recipe[t] ? structuredClone(recipe[t]) : blank()]));
  let temp = 'Hot';
  let dirty = false;

  const d = recipeDialog(`
    <div class="row recipe-head"><h2 style="margin:0">Recipe · ${esc(product.name)}</h2><span class="spacer"></span>
      <button data-close aria-label="Close">✕</button></div>
    <div class="row" style="margin-bottom:12px"><div class="tabs" id="rTabs" style="margin:0">${TEMPS.map((t) => `<button data-t="${t}">${t}</button>`).join('')}</div>
      <span class="spacer"></span><button id="rCopy"></button></div>
    <div id="rBody"></div>
    <div class="row" style="margin-top:16px"><span class="muted" style="font-size:13px">Leave Hot or Cold empty if it has no recipe.</span>
      <span class="spacer"></span><button data-close>Cancel</button><button class="primary" id="rSave">Save recipe</button></div>`,
  () => !dirty || confirm('Discard recipe changes?'));

  function render() {
    d.querySelectorAll('#rTabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === temp));
    const other = TEMPS.find((t) => t !== temp);
    $('#rCopy', d).textContent = `Copy from ${other}`;
    const r = data[temp];
    $('#rBody', d).innerHTML = `
      <h3>Ingredients <span class="muted" style="font-weight:400;font-size:13px">amount per size, e.g. "2 shots" or "180 ml"</span></h3>
      <table class="recipe-edit"><thead><tr><th>Ingredient</th>${SIZES.map((s) => `<th>${s}</th>`).join('')}<th></th></tr></thead>
        <tbody>${r.ingredients.map((ing, i) => `<tr data-i="${i}">
          <td><input data-k="item" value="${esc(ing.item)}" placeholder="e.g. Espresso"></td>
          ${SIZES.map((s) => `<td><input data-s="${s}" value="${esc(ing.amounts[s] || '')}"></td>`).join('')}
          <td style="white-space:nowrap"><button data-mv="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button data-mv="1" title="Move down" ${i === r.ingredients.length - 1 ? 'disabled' : ''}>↓</button><button class="danger" data-rm title="Remove">✕</button></td>
        </tr>`).join('')}</tbody></table>
      <button id="rAdd" style="margin-top:6px">+ Add ingredient</button>
      <h3>How to make it <span class="muted" style="font-weight:400;font-size:13px">one step per line</span></h3>
      <textarea id="rSteps" rows="6">${esc(r.steps.join('\n'))}</textarea>
      <h3>Notes <span class="muted" style="font-weight:400;font-size:13px">optional, e.g. cup size or garnish</span></h3>
      <textarea id="rNotes" rows="2">${esc(r.notes)}</textarea>`;
  }

  d.addEventListener('input', (e) => {
    const r = data[temp];
    dirty = true;
    if (e.target.id === 'rSteps') r.steps = e.target.value.split('\n');
    else if (e.target.id === 'rNotes') r.notes = e.target.value;
    else {
      const tr = e.target.closest('tr[data-i]'); if (!tr) return;
      const ing = r.ingredients[Number(tr.dataset.i)];
      if (e.target.dataset.k) ing.item = e.target.value; else ing.amounts[e.target.dataset.s] = e.target.value;
    }
  });
  d.addEventListener('click', async (e) => {
    const r = data[temp];
    const tab = e.target.closest('#rTabs button');
    if (tab) { temp = tab.dataset.t; return render(); }
    if (e.target.id === 'rAdd') { r.ingredients.push({ item: '', amounts: {} }); dirty = true; render(); return d.querySelector('tbody tr:last-child input')?.focus(); }
    if (e.target.id === 'rCopy') {
      const other = TEMPS.find((t) => t !== temp);
      if ((r.ingredients.length || r.steps.some(Boolean)) && !confirm(`Replace the ${temp} recipe with a copy of ${other}?`)) return;
      data[temp] = structuredClone(data[other]); dirty = true; return render();
    }
    const tr = e.target.closest('tr[data-i]');
    if (tr && e.target.hasAttribute('data-rm')) { r.ingredients.splice(Number(tr.dataset.i), 1); dirty = true; return render(); }
    if (tr && e.target.dataset.mv) {
      const i = Number(tr.dataset.i), j = i + Number(e.target.dataset.mv);
      [r.ingredients[i], r.ingredients[j]] = [r.ingredients[j], r.ingredients[i]]; dirty = true; return render();
    }
    if (e.target.id === 'rSave') {
      e.target.disabled = true;
      try {
        await api(`/api/admin/recipes/${product.id}`, { method: 'PUT', body: data });
        dirty = false; d.close(); toast(`Recipe for ${product.name} saved`);
      } catch (err) { toast(err.message, true); e.target.disabled = false; }
    }
  });
  render();
}
