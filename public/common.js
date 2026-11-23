// Shared helpers for all pages.
const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const TEMPS = ['Hot', 'Cold'];
const SIZES = ['Small', 'Medium', 'Large'];

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const pin = sessionStorage.getItem('adminPin');
  if (pin) headers['X-Admin-Pin'] = pin;
  const res = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer;
function toast(msg, isError) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); document.body.appendChild(el); }
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), isError ? 6000 : 3000);
}

function header(active) {
  const links = [['/', 'Take order', 'order'], ['/admin', 'Products & prices', 'admin'], ['/reports', 'Sales reports', 'reports']];
  document.body.insertAdjacentHTML('afterbegin', `<header><h1>☕ Coffee POS</h1><nav>${
    links.map(([href, label, key]) => `<a href="${href}" class="${key === active ? 'active' : ''}">${label}</a>`).join('')
  }</nav><span class="spacer"></span>${active !== 'order' ? '<a href="#" id="lock" style="color:#fff;opacity:.8">Lock</a>' : ''}</header>`);
  $('#lock')?.addEventListener('click', (e) => { e.preventDefault(); sessionStorage.removeItem('adminPin'); location.reload(); });
}

// Shows a PIN form until the correct admin PIN is entered, then calls onReady().
async function requirePin(container, onReady) {
  if (sessionStorage.getItem('adminPin')) {
    try { await api('/api/admin/check', { method: 'POST' }); return onReady(); }
    catch { sessionStorage.removeItem('adminPin'); }
  }
  container.innerHTML = `<form class="card gate"><h2>Admin PIN</h2>
    <p class="muted">Enter the admin PIN to continue.</p>
    <input type="password" inputmode="numeric" autocomplete="off" id="pin" autofocus>
    <button class="primary" style="width:100%">Unlock</button></form>`;
  $('form', container).addEventListener('submit', async (e) => {
    e.preventDefault();
    sessionStorage.setItem('adminPin', $('#pin').value);
    try { await api('/api/admin/check', { method: 'POST' }); onReady(); }
    catch { sessionStorage.removeItem('adminPin'); toast('Wrong PIN', true); $('#pin').value = ''; $('#pin').focus(); }
  });
}
