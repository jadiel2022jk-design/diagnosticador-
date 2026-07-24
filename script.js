const STORAGE_KEY = 'banco_diagnostico_profiles_v2';
const AVATAR_COLORS = [
  'linear-gradient(135deg, #6EC1FF, #4A7DFF)',
  'linear-gradient(135deg, #B892FF, #7C5CFF)',
  'linear-gradient(135deg, #FF9ECB, #FF6FA5)',
  'linear-gradient(135deg, #5EEAD4, #22B8A0)',
  'linear-gradient(135deg, #FFD166, #F2A83B)',
  'linear-gradient(135deg, #FF9F68, #F2703B)',
  'linear-gradient(135deg, #9AA8FF, #6E7CFF)',
  'linear-gradient(135deg, #C7CEDB, #8E97A8)'
];

const profileScreen = document.getElementById('profileScreen');
const profileGrid = document.getElementById('profileGrid');
const manageToggle = document.getElementById('manageToggle');

const thread = document.getElementById('thread');
const form = document.getElementById('chatForm');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const activeProfileLabel = document.getElementById('activeProfileLabel');
const switchProfileBtn = document.getElementById('switchProfileBtn');

const historyBtn = document.getElementById('historyBtn');
const historyModal = document.getElementById('historyModal');
const historyContent = document.getElementById('historyContent');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');

const editModal = document.getElementById('editModal');
const editTitle = document.getElementById('editTitle');
const profileNameInput = document.getElementById('profileNameInput');
const providerSelect = document.getElementById('providerSelect');
const customUrlField = document.getElementById('customUrlField');
const customUrlInput = document.getElementById('customUrlInput');
const profileKeyInput = document.getElementById('profileKeyInput');
const providerHint = document.getElementById('providerHint');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const deleteProfileBtn = document.getElementById('deleteProfileBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const avatarPreview = document.getElementById('avatarPreview');
const uploadAvatarBtn = document.getElementById('uploadAvatarBtn');
const removeAvatarBtn = document.getElementById('removeAvatarBtn');
const avatarFileInput = document.getElementById('avatarFileInput');
const colorRow = document.getElementById('colorRow');

let store = { profiles: {}, activeId: null };
let editingId = null;
let editAvatarImage = null;
let editAvatarColor = AVATAR_COLORS[0];
let managingProfiles = false;

const SYSTEM_PROMPT = `Eres un técnico senior de electrónica con décadas de experiencia en reparación a nivel de componente. Dominas tres áreas por igual:

1. Consolas de videojuegos (PS4, PS5, Xbox Series/One, Nintendo Switch, generaciones anteriores)
2. Dispositivos móviles Android de todas las marcas (Samsung, Xiaomi, Motorola, Huawei, etc.) — carga, batería, pantalla, placa lógica, conectores
3. Laptops de todas las marcas (HP, Dell, Lenovo, Asus, Apple, etc.) — encendido, carga, pantalla, teclado, placa madre

Reglas de tu comportamiento:
- Responde siempre en español, con tono directo de taller, técnico a técnico, sin rodeos.
- Sé concreto: voltajes esperados, nombres de componentes típicos, orden lógico de pruebas de menor a mayor costo/riesgo.
- Si falta un dato clave para diagnosticar, pregúntalo primero antes de dar un diagnóstico largo.
- Cuando dudes de un dato técnico muy específico, dilo honestamente en vez de inventar un dato que suene convincente.
- Prioriza siempre las pruebas más baratas y menos destructivas antes de sugerir resoldar, reballing o cambiar piezas.
- Usa listas cortas y párrafos breves — este chat se usa en taller mientras se trabaja con las manos.`;

/* ---------- utilidades ---------- */

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* ---------- persistencia ---------- */

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) store = JSON.parse(raw);
  } catch (e) { console.error('No se pudo leer el almacenamiento local', e); }
}
function saveStore() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
  catch (e) { console.error('No se pudo guardar (¿imagen muy pesada?)', e); alert('No se pudo guardar. Si subiste una foto muy grande, prueba con una más liviana.'); }
}
function activeProfile() { return store.activeId ? store.profiles[store.activeId] : null; }

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0,2).map(w => w[0].toUpperCase()).join('');
}

function avatarInnerHtml(p, size) {
  if (p.avatarImage) return `<img src="${p.avatarImage}" alt="">`;
  return `<span>${initials(p.name)}</span>`;
}

function applyAvatarStyle(el, p) {
  if (!p.avatarImage) el.style.background = p.avatarColor || AVATAR_COLORS[0];
  else el.style.background = 'transparent';
}

/* ---------- pantalla de perfiles ---------- */

function renderProfileScreen() {
  profileGrid.innerHTML = '';
  profileScreen.classList.toggle('managing', managingProfiles);

  Object.keys(store.profiles).forEach(id => {
    const p = store.profiles[id];
    const card = document.createElement('div');
    card.className = 'profile-card';
    const tile = document.createElement('div');
    tile.className = 'avatar-tile';
    tile.innerHTML = avatarInnerHtml(p) + '<div class="edit-pencil"><svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></div>';
    applyAvatarStyle(tile, p);
    const name = document.createElement('div');
    name.className = 'pname';
    name.textContent = p.name;
    card.appendChild(tile);
    card.appendChild(name);
    card.addEventListener('click', () => {
      if (managingProfiles) { openEditModal(id); return; }
      enterProfile(id);
    });
    profileGrid.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'profile-card';
  addCard.innerHTML = `<div class="avatar-tile add-tile"><svg class="icon" viewBox="0 0 24 24" style="width:30px;height:30px;"><path d="M12 5v14M5 12h14"/></svg></div><div class="pname">Añadir</div>`;
  addCard.addEventListener('click', () => openEditModal(null));
  profileGrid.appendChild(addCard);
}

function enterProfile(id) {
  store.activeId = id;
  saveStore();
  profileScreen.style.display = 'none';
  updateHeaderUI();
  renderThreadFromHistory();
}

function showProfileScreen() {
  managingProfiles = false;
  renderProfileScreen();
  profileScreen.style.display = 'flex';
}

manageToggle.addEventListener('click', () => {
  managingProfiles = !managingProfiles;
  manageToggle.classList.toggle('active', managingProfiles);
  profileScreen.classList.toggle('managing', managingProfiles);
});

switchProfileBtn.addEventListener('click', showProfileScreen);

/* ---------- header de chat ---------- */

function updateHeaderUI() {
  const p = activeProfile();
  if (!p) return;
  activeProfileLabel.textContent = p.name;
  switchProfileBtn.innerHTML = avatarInnerHtml(p);
  applyAvatarStyle(switchProfileBtn, p);
}

/* ---------- hilo de chat ---------- */

function buildEmptyStateHtml() {
  return `<span class="eyebrow">Cómo usarlo</span><br>
    Describe la falla como se la contarías a otro técnico: equipo, marca y modelo, síntoma exacto, y qué ya se probó o midió.
    <div class="chip-row">
      <div class="chip" data-fill="PS4 Slim con error CE-34335-8, ya cambié el HDD y sigue igual">Consola: error de HDD</div>
      <div class="chip" data-fill="Samsung Galaxy A54 no carga, el conector se ve bien físicamente">Android: no carga</div>
      <div class="chip" data-fill="Laptop HP no enciende, el LED de carga prende pero la pantalla no">Laptop: no enciende</div>
      <div class="chip" data-fill="Necesito identificar un chip por el código grabado en la superficie">Identificar componente</div>
    </div>`;
}

function attachChipHandlers() {
  thread.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.fill;
      input.focus();
      input.dispatchEvent(new Event('input'));
    });
  });
}

function scrollToBottom() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }

function renderThreadFromHistory() {
  const p = activeProfile();
  thread.innerHTML = '';
  if (!p || !p.history || p.history.length === 0) {
    const div = document.createElement('div');
    div.className = 'empty glass';
    div.innerHTML = buildEmptyStateHtml();
    thread.appendChild(div);
    attachChipHandlers();
    return;
  }
  p.history.forEach(m => renderMessage(m.role, m.content, false));
  scrollToBottom();
}

function renderMessage(role, text, animate) {
  const existingEmpty = thread.querySelector('.empty');
  if (existingEmpty) existingEmpty.remove();
  const p = activeProfile();
  const msg = document.createElement('div');
  msg.className = 'msg ' + role;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (role === 'user' && p) {
    avatar.innerHTML = avatarInnerHtml(p);
    applyAvatarStyle(avatar, p);
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  msg.appendChild(avatar);
  msg.appendChild(bubble);
  thread.appendChild(msg);
  scrollToBottom();
  return bubble;
}

function addThinking() {
  const msg = document.createElement('div');
  msg.className = 'msg assistant';
  msg.id = 'thinkingMsg';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  const bubble = document.createElement('div');
  bubble.className = 'bubble thinking';
  bubble.innerHTML = 'analizando<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
  msg.appendChild(avatar);
  msg.appendChild(bubble);
  thread.appendChild(msg);
  scrollToBottom();
}
function removeThinking() { const el = document.getElementById('thinkingMsg'); if (el) el.remove(); }

/* ---------- llamada a la API ---------- */

function buildRequest(p, messages) {
  const cleanMsgs = messages.map(m => ({ role: m.role, content: m.content }));
  if (p.provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: { model: 'claude-sonnet-5', max_tokens: 1000, system: SYSTEM_PROMPT, messages: cleanMsgs }
    };
  }
  if (p.provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
      body: { model: 'gpt-4o-mini', max_tokens: 1000, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...cleanMsgs] }
    };
  }
  if (p.provider === 'custom') {
    return {
      url: p.customUrl,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
      body: { model: p.model || 'default', max_tokens: 1000, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...cleanMsgs] }
    };
  }
  return {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
    body: { model: 'llama-3.3-70b-versatile', max_tokens: 1000, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...cleanMsgs] }
  };
}

function extractText(p, data) {
  if (p.provider === 'anthropic') {
    if (data.content && data.content.length) return data.content.map(b => b.text || '').join('\n').trim();
    return null;
  }
  if (data.choices && data.choices.length) return (data.choices[0].message.content || '').trim();
  return null;
}

async function sendMessage(text) {
  const p = activeProfile();
  if (!p) { showProfileScreen(); return; }

  p.history = p.history || [];
  p.history.push({ role: 'user', content: text, ts: Date.now() });
  saveStore();

  addThinking();
  sendBtn.disabled = true;

  try {
    const req = buildRequest(p, p.history);
    const response = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
    const data = await response.json();
    removeThinking();

    if (!response.ok) {
      const detail = (data && data.error && (data.error.message || data.error.type)) || ('HTTP ' + response.status);
      renderMessage('assistant', 'Error del servidor: ' + detail);
      p.history.pop(); saveStore();
      return;
    }
    const textBlock = extractText(p, data);
    if (textBlock) {
      renderMessage('assistant', textBlock);
      p.history.push({ role: 'assistant', content: textBlock, ts: Date.now() });
      saveStore();
    } else {
      renderMessage('assistant', 'Respuesta vacía o inesperada.');
      p.history.pop(); saveStore();
    }
  } catch (err) {
    removeThinking();
    renderMessage('assistant', 'Error de conexión: ' + (err && err.message ? err.message : String(err)));
    p.history.pop(); saveStore();
  } finally {
    sendBtn.disabled = false;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  if (!activeProfile()) { showProfileScreen(); return; }
  renderMessage('user', text);
  input.value = ''; input.style.height = 'auto';
  sendMessage(text);
});
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });

/* ---------- historial ---------- */

function fmtDay(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function renderHistoryModal() {
  const p = activeProfile();
  historyContent.innerHTML = '';
  if (!p || !p.history || p.history.length === 0) {
    historyContent.innerHTML = '<div class="history-empty">Todavía no hay mensajes en este perfil.</div>';
    return;
  }
  let lastDay = null;
  p.history.forEach(m => {
    const ts = m.ts || Date.now();
    const day = fmtDay(ts);
    if (day !== lastDay) {
      const dayEl = document.createElement('div');
      dayEl.className = 'history-day';
      dayEl.textContent = day;
      historyContent.appendChild(dayEl);
      lastDay = day;
    }
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    entry.innerHTML = `<div class="history-role ${m.role === 'user' ? 'user' : ''}">${m.role === 'user' ? p.name : 'Banco'}<span class="history-time">${fmtTime(ts)}</span></div><div class="history-content">${escapeHtml(m.content)}</div>`;
    historyContent.appendChild(entry);
  });
}

historyBtn.addEventListener('click', () => { renderHistoryModal(); historyModal.style.display = 'flex'; });
closeHistoryBtn.addEventListener('click', () => historyModal.style.display = 'none');
clearHistoryBtn.addEventListener('click', () => {
  const p = activeProfile();
  if (!p) return;
  if (confirm('¿Borrar todo el historial de "' + p.name + '"? Esto no se puede deshacer.')) {
    p.history = [];
    saveStore();
    renderHistoryModal();
    renderThreadFromHistory();
  }
});

/* ---------- crear / editar perfil ---------- */

function renderColorRow() {
  colorRow.innerHTML = '';
  AVATAR_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (c === editAvatarColor ? ' selected' : '');
    sw.style.background = c;
    sw.addEventListener('click', () => {
      editAvatarColor = c;
      renderColorRow();
      updateAvatarPreview();
    });
    colorRow.appendChild(sw);
  });
}

function updateAvatarPreview() {
  const name = profileNameInput.value || '?';
  if (editAvatarImage) {
    avatarPreview.innerHTML = `<img src="${editAvatarImage}" alt="">`;
    avatarPreview.style.background = 'transparent';
  } else {
    avatarPreview.innerHTML = `<span>${initials(name)}</span>`;
    avatarPreview.style.background = editAvatarColor;
  }
}

profileNameInput.addEventListener('input', updateAvatarPreview);

uploadAvatarBtn.addEventListener('click', () => avatarFileInput.click());
avatarFileInput.addEventListener('change', () => {
  const file = avatarFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { editAvatarImage = reader.result; updateAvatarPreview(); };
  reader.readAsDataURL(file);
});
removeAvatarBtn.addEventListener('click', () => { editAvatarImage = null; updateAvatarPreview(); });

function openEditModal(id) {
  editingId = id || null;
  const p = id ? store.profiles[id] : null;
  editTitle.textContent = p ? 'Editar perfil' : 'Nuevo perfil';
  profileNameInput.value = p ? p.name : '';
  providerSelect.value = p ? p.provider : 'groq';
  customUrlInput.value = p ? (p.customUrl || '') : '';
  profileKeyInput.value = p ? p.apiKey : '';
  editAvatarImage = p ? (p.avatarImage || null) : null;
  editAvatarColor = p ? (p.avatarColor || AVATAR_COLORS[0]) : AVATAR_COLORS[Object.keys(store.profiles).length % AVATAR_COLORS.length];
  deleteProfileBtn.style.display = p ? 'block' : 'none';
  updateProviderHint();
  renderColorRow();
  updateAvatarPreview();
  editModal.style.display = 'flex';
  setTimeout(() => profileNameInput.focus(), 50);
}
function closeEditModal() { editModal.style.display = 'none'; editingId = null; }

cancelEditBtn.addEventListener('click', closeEditModal);
providerSelect.addEventListener('change', updateProviderHint);

function updateProviderHint() {
  const val = providerSelect.value;
  customUrlField.style.display = val === 'custom' ? 'block' : 'none';
  const hints = {
    groq: 'Consíguela gratis en <span class="mono">console.groq.com</span> → API Keys → Create API Key.',
    anthropic: 'Consíguela en <span class="mono">console.anthropic.com</span> → API Keys.',
    openai: 'Consíguela en <span class="mono">platform.openai.com</span> → API Keys.',
    custom: 'Pega la URL completa del endpoint y la clave de ese proveedor (debe ser compatible con el formato de OpenAI).'
  };
  providerHint.innerHTML = hints[val] || '';
}

saveProfileBtn.addEventListener('click', () => {
  const name = profileNameInput.value.trim();
  const provider = providerSelect.value;
  const apiKey = profileKeyInput.value.trim();
  const customUrl = customUrlInput.value.trim();

  if (!name) { alert('Ponle un nombre al perfil.'); return; }
  if (!apiKey) { alert('Falta la clave de API.'); return; }
  if (provider === 'custom' && !customUrl) { alert('Falta la URL del endpoint.'); return; }

  const id = editingId || ('p_' + Date.now());
  const existing = store.profiles[id] || {};
  store.profiles[id] = {
    name, provider, apiKey, customUrl,
    avatarImage: editAvatarImage,
    avatarColor: editAvatarColor,
    history: existing.history || []
  };
  saveStore();
  closeEditModal();

  if (store.activeId === id) updateHeaderUI();

  if (profileScreen.style.display !== 'none') {
    renderProfileScreen();
  }
});

deleteProfileBtn.addEventListener('click', () => {
  if (!editingId) return;
  const p = store.profiles[editingId];
  if (!confirm('¿Eliminar el perfil "' + p.name + '" y todo su historial? Esto no se puede deshacer.')) return;
  delete store.profiles[editingId];
  if (store.activeId === editingId) store.activeId = null;
  saveStore();
  closeEditModal();
  if (!store.activeId) {
    showProfileScreen();
  } else {
    renderProfileScreen();
  }
});

document.addEventListener('click', (e) => {
  if (e.target === historyModal) historyModal.style.display = 'none';
  if (e.target === editModal) closeEditModal();
});

/* ---------- init ---------- */

loadStore();

if (Object.keys(store.profiles).length === 0) {
  profileScreen.style.display = 'flex';
  renderProfileScreen();
  openEditModal(null);
} else if (!store.activeId) {
  showProfileScreen();
} else {
  profileScreen.style.display = 'none';
  updateHeaderUI();
  renderThreadFromHistory();
}
