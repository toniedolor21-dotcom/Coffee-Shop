// Optional AI assistant for the admin side (sales summaries and questions about sales).
// Uses Node's built-in fetch, no packages. The order screen never calls this module,
// and the whole app works offline when no API key is set.

const PROVIDERS = {
  openai: { label: 'OpenAI', defaultModel: 'gpt-5-mini', envKey: 'OPENAI_API_KEY' },
  anthropic: { label: 'Claude (Anthropic)', defaultModel: 'claude-haiku-5-5', envKey: 'ANTHROPIC_API_KEY' },
};
const TIMEOUT_MS = 60000;

class AiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// settings: { provider, openai_key, anthropic_key, openai_model, anthropic_model } saved by the admin. Saved values win over environment variables.
function resolve(settings = {}) {
  const env = process.env;
  let provider = settings.provider || env.AI_PROVIDER || '';
  if (!provider) provider = (settings.openai_key || env.OPENAI_API_KEY) ? 'openai'
    : (settings.anthropic_key || env.ANTHROPIC_API_KEY) ? 'anthropic' : 'openai';
  provider = String(provider).toLowerCase();
  if (provider === 'claude') provider = 'anthropic';
  if (provider === 'off') return { provider: 'off', enabled: false };
  const def = PROVIDERS[provider];
  if (!def) return { provider, enabled: false, problem: `Unknown AI provider "${provider}"` };
  const savedKey = settings[`${provider}_key`];
  const key = savedKey || env[def.envKey] || '';
  const model = settings[`${provider}_model`] || env.AI_MODEL || def.defaultModel;
  return { provider, label: def.label, key, keySource: savedKey ? 'saved' : key ? 'environment' : '', model, enabled: !!key };
}

function maskKey(k) { return k ? `${k.slice(0, 3)}…${k.slice(-4)}` : ''; }

async function post(url, headers, body) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new AiError(504, 'The AI service took too long to answer. Try again.');
    throw new AiError(502, 'Could not reach the AI service. Check the internet connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.error?.message || '';
    if (res.status === 401 || res.status === 403) throw new AiError(502, 'The AI service rejected the API key. Check it in Products & prices > AI assistant.');
    if (res.status === 429) throw new AiError(502, 'The AI service is busy or the account is out of credit. ' + detail);
    if (res.status === 404) throw new AiError(502, 'The AI model was not found. Check the model name in AI settings. ' + detail);
    throw new AiError(502, `AI service error (${res.status}). ${detail}`.trim());
  }
  return data;
}

// messages: [{ role: 'user' | 'assistant', content }]
async function chat(cfg, system, messages) {
  if (!cfg.enabled) throw new AiError(400, 'AI is not set up. Add an API key in Products & prices > AI assistant.');
  if (cfg.provider === 'openai') {
    const data = await post('https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${cfg.key}` },
      { model: cfg.model, messages: [{ role: 'system', content: system }, ...messages] });
    return String(data.choices?.[0]?.message?.content || '').trim();
  }
  const data = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
    { model: cfg.model, max_tokens: 1500, system, messages });
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

const STYLE = `You help the owner of a small coffee shop in the Philippines understand their sales.
Money is in Philippine pesos; write amounts like ₱1,250.00. Write in simple, friendly English for a non-technical shop owner.
Use plain text: short paragraphs or lines starting with "- ". You may use **bold** for key numbers. No tables, no headings, no code.
Only use the numbers in the data given. If the data cannot answer something, say so plainly. Do not invent figures.
Voided orders are already excluded from all figures.`;

async function summarize(cfg, data) {
  const system = `${STYLE}\nKeep the summary to 4 to 7 short lines. Cover total sales and orders, how it compares with the previous period if given, best and weakest sellers, busiest and slowest days or months, and one practical suggestion.`;
  const user = `Summarize this sales report.\n\n${JSON.stringify(data)}`;
  return chat(cfg, system, [{ role: 'user', content: user }]);
}

async function ask(cfg, context, question, history = []) {
  const system = `${STYLE}\nAnswer the owner's question in a few lines using this sales data from the shop's POS:\n\n${JSON.stringify(context)}`;
  const past = history.slice(-6).filter((m) => m && ['user', 'assistant'].includes(m.role) && m.content)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  return chat(cfg, system, [...past, { role: 'user', content: question }]);
}

module.exports = { PROVIDERS, AiError, resolve, maskKey, chat, summarize, ask };
