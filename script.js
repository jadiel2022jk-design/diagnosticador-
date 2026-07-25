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

// Nuevos elementos para imagen y PDF
const generateImageBtn = document.getElementById('generateImageBtn');
const imageModal = document.getElementById('imageModal');
const imagePromptInput = document.getElementById('imagePromptInput');
const imageGenerateBtn = document.getElementById('imageGenerateBtn');
const closeImageBtn = document.getElementById('closeImageBtn');
const imageResultContainer = document.getElementById('imageResultContainer');
const imageLoading = document.getElementById('imageLoading');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');

let store = { profiles: {}, activeId: null };
let editingId = null;
let editAvatarImage = null;
let editAvatarColor = AVATAR_COLORS[0];
let managingProfiles = false;

const SYSTEM_PROMPT = `Eres DMZ, un asistente virtual completo. Ayudas con cualquier tema que te pidan: dudas generales, redacción, cálculos, organización, explicaciones, recomendaciones, y también tienes una especialidad fuerte en reparación electrónica a nivel de componente:

1. Consolas de videojuegos (PS4, PS5, Xbox Series/One, Nintendo Switch, generaciones anteriores)
2. Dispositivos móviles Android de todas las marcas (Samsung, Xiaomi, Motorola, Huawei, etc.) — carga, batería, pantalla, placa lógica, conectores
3. Laptops de todas las marcas (HP, Dell, Lenovo, Asus, Apple, etc.) — encendido, carga, pantalla, teclado, placa madre

Reglas de tu comportamiento:
- Responde siempre en español, con tono directo y claro.
- Adapta el registro al tema: técnico a técnico y concreto (voltajes, componentes, orden de pruebas de menor a mayor costo/riesgo) cuando sea sobre reparación electrónica; conversacional y útil para cualquier otro tema.
- Si falta un dato clave para ayudar bien, pregúntalo primero antes de dar una respuesta larga.
- Cuando dudes de un dato muy específico, dilo honestamente en vez de inventar un dato que suene convincente.
- En temas de reparación, prioriza siempre las pruebas más baratas y menos destructivas antes de sugerir resoldar, reballing o cambiar piezas.
- Usa listas cortas y párrafos breves.
- Tienes disponibles las herramientas "generar_imagen" y "generar_documento". Úsalas cuando realmente ayuden (un diagrama, una foto ilustrativa, o un reporte/documento que el usuario pidió) en vez de decir que no puedes generar ese tipo de contenido.`;

/* ---------- definición de herramientas (tool calling) ---------- */

const TOOL_DEFS = [
  {
    name: 'generar_imagen',
    description: 'Genera una imagen (diagrama, esquema o foto ilustrativa) y la muestra en el chat. Úsala cuando una imagen ayude a explicar un componente, conector, circuito o procedimiento.',
    params: {
      prompt: { type: 'string', description: 'Descripción detallada EN INGLÉS de la imagen a generar (colores, ángulo, estilo, iluminación, qué se debe ver con claridad).' }
    },
    required: ['prompt']
  },
  {
    name: 'generar_documento',
    description: 'Genera un documento/reporte descargable (para abrir e imprimir como PDF) con la información pedida por el usuario, por ejemplo un reporte de diagnóstico o un presupuesto.',
    params: {
      titulo: { type: 'string', description: 'Título del documento' },
      contenido_markdown: { type: 'string', description: 'Contenido completo del documento en formato Markdown (usa #, ##, listas con -, **negrita**)' }
    },
    required: ['titulo', 'contenido_markdown']
  }
];

function anthropicTools() {
  return TOOL_DEFS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: { type: 'object', properties: t.params, required: t.required }
  }));
}
function openaiTools() {
  return TOOL_DEFS.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: { type: 'object', properties: t.params, required: t.required } }
  }));
}
function googleTools() {
  const upperType = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { type: v.type.toUpperCase(), description: v.description }]));
  return [{
    functionDeclarations: TOOL_DEFS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: { type: 'OBJECT', properties: upperType(t.params), required: t.required }
    }))
  }];
}

/* ---------- ejecución de herramientas ---------- */

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('No se pudo generar la imagen'));
    img.src = url;
  });
}

async function executeToolCall(name, args) {
  args = args || {};
  if (name === 'generar_imagen') {
    const seed = Math.floor(Math.random() * 99999);
    const encodedPrompt = encodeURIComponent(args.prompt || '');
    const imageUrl = 'https://image.pollinations.ai/prompt/' + encodedPrompt + '?model=flux&width=768&height=768&nologo=true&seed=' + seed + '&enhance=true';
    try {
      await preloadImage(imageUrl);
      return { artifact: { type: 'image', url: imageUrl, prompt: args.prompt }, toolResultText: 'Imagen generada y mostrada al usuario en el chat.' };
    } catch (e) {
      return { artifact: null, toolResultText: 'No se pudo generar la imagen, informa al usuario.' };
    }
  }
  if (name === 'generar_documento') {
    const html = buildDocumentHtml(args.contenido_markdown || '', args.titulo || 'Documento');
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    return { artifact: { type: 'document', url, title: args.titulo || 'Documento' }, toolResultText: 'Documento generado y disponible para el usuario en el chat.' };
  }
  return { artifact: null, toolResultText: 'Herramienta desconocida.' };
}

const PDF_SYSTEM_PROMPT = `A partir del historial de chat entre un usuario y un asistente virtual, genera un DOCUMENTO/REPORTE profesional en formato Markdown que resuma lo tratado. Si la conversación es sobre una reparación o diagnóstico técnico, usa esta estructura:
- Título con el equipo y la falla
- Resumen del problema
- Diagnóstico con los pasos recomendados (ordenados de menor a mayor costo/riesgo)
- Componentes a verificar (con voltajes esperados si los mencionó el chat)
- Herramientas necesarias
- Conclusión y recomendación final

Si la conversación es sobre otro tema, adapta la estructura a lo que tenga sentido (título, resumen, puntos clave, conclusión/próximos pasos).

No inventes datos que no fueron mencionados en el chat. Usa solo la información disponible.`;

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
    tile.className = 'avatar-tile' + (id === store.activeId ? ' recent' : '');
    tile.innerHTML = avatarInnerHtml(p) + '<div class="edit-pencil"><svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></div>';
    applyAvatarStyle(tile, p);
    const name = document.createElement('div');
    name.className = 'pname';
    name.textContent = p.name;
    card.appendChild(tile);
    card.appendChild(name);
    if (id === store.activeId) {
      const tag = document.createElement('div');
      tag.className = 'recent-tag';
      tag.textContent = 'Reciente';
      card.appendChild(tag);
    }
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
    Preguntame lo que necesites: desde una duda cualquiera hasta un diagnóstico técnico. Para reparaciones, cuéntame como se lo contarías a otro técnico: equipo, marca y modelo, síntoma exacto, y qué ya se probó o midió.
    <div class="chip-row">
      <div class="chip" data-fill="PS4 Slim con error CE-34335-8, ya cambié el HDD y sigue igual">Consola: error de HDD</div>
      <div class="chip" data-fill="Samsung Galaxy A54 no carga, el conector se ve bien físicamente">Android: no carga</div>
      <div class="chip" data-fill="Laptop HP no enciende, el LED de carga prende pero la pantalla no">Laptop: no enciende</div>
      <div class="chip" data-fill="Ayúdame a redactar un mensaje para pedir un aumento de sueldo">Otra cosa: redactar un mensaje</div>
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
  p.history.forEach(m => renderMessage(m.role, m.content, false, m.imageUrls));
  scrollToBottom();
}

function renderMessage(role, text, animate, imageUrls) {
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

  // Mostrar imágenes si existen
  if (imageUrls && imageUrls.length > 0) {
    imageUrls.forEach(url => {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'generated-image-wrap';
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Imagen generada';
      img.loading = 'lazy';
      imgWrap.appendChild(img);
      const dlBtn = document.createElement('a');
      dlBtn.href = url;
      dlBtn.download = 'generada.png';
      dlBtn.className = 'img-download';
      dlBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Descargar';
      imgWrap.appendChild(dlBtn);
      thread.appendChild(imgWrap);
    });
  }

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

/* ---------- llamada a la API (ver runAnthropicConversation / runGoogleConversation / runOpenAIStyleConversation más abajo) ---------- */

const MAX_TOOL_ITERATIONS = 4;

async function runAnthropicConversation(p) {
  const artifacts = [];
  let messages = p.history.map(m => ({ role: m.role, content: m.content }));

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1200, system: SYSTEM_PROMPT, tools: anthropicTools(), messages })
    });
    const data = await resp.json();
    if (!resp.ok) return { error: (data.error && data.error.message) || ('HTTP ' + resp.status) };

    const toolUses = (data.content || []).filter(b => b.type === 'tool_use');
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (toolUses.length === 0) return { text: text || null, artifacts };

    messages.push({ role: 'assistant', content: data.content });
    const toolResults = [];
    for (const tu of toolUses) {
      const { artifact, toolResultText } = await executeToolCall(tu.name, tu.input);
      if (artifact) artifacts.push(artifact);
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: toolResultText });
    }
    messages.push({ role: 'user', content: toolResults });
  }
  return { text: null, artifacts };
}

async function runGoogleConversation(p) {
  const artifacts = [];
  let contents = p.history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + p.apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents, tools: googleTools(), generationConfig: { maxOutputTokens: 1200 } })
    });
    const data = await resp.json();
    if (!resp.ok) return { error: (data.error && data.error.message) || ('HTTP ' + resp.status) };

    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const functionCalls = parts.filter(pt => pt.functionCall);
    const text = parts.filter(pt => pt.text).map(pt => pt.text).join('\n').trim();
    if (functionCalls.length === 0) return { text: text || null, artifacts };

    contents.push({ role: 'model', parts });
    const responseParts = [];
    for (const fc of functionCalls) {
      const { artifact, toolResultText } = await executeToolCall(fc.functionCall.name, fc.functionCall.args);
      if (artifact) artifacts.push(artifact);
      responseParts.push({ functionResponse: { name: fc.functionCall.name, response: { result: toolResultText } } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }
  return { text: null, artifacts };
}

async function runOpenAIStyleConversation(p) {
  const artifacts = [];
  const apiUrl = p.provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' :
                 p.provider === 'custom' ? p.customUrl : 'https://api.groq.com/openai/v1/chat/completions';
  const model = p.provider === 'openai' ? 'gpt-4o-mini' : (p.provider === 'custom' ? (p.model || 'default') : 'llama-3.3-70b-versatile');
  let messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...p.history.map(m => ({ role: m.role, content: m.content }))];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
      body: JSON.stringify({ model, max_tokens: 1200, messages, tools: openaiTools() })
    });
    const data = await resp.json();
    if (!resp.ok) return { error: (data.error && (data.error.message || data.error.type)) || ('HTTP ' + resp.status) };

    const msg = data.choices && data.choices[0] && data.choices[0].message;
    const toolCalls = msg && msg.tool_calls;
    if (!toolCalls || toolCalls.length === 0) return { text: msg ? (msg.content || '').trim() : null, artifacts };

    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) {}
      const { artifact, toolResultText } = await executeToolCall(tc.function.name, args);
      if (artifact) artifacts.push(artifact);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: toolResultText });
    }
  }
  return { text: null, artifacts };
}

function runConversation(p) {
  if (p.provider === 'anthropic') return runAnthropicConversation(p);
  if (p.provider === 'google') return runGoogleConversation(p);
  return runOpenAIStyleConversation(p);
}

function renderDocumentMessage(title, url) {
  const existingEmpty = thread.querySelector('.empty');
  if (existingEmpty) existingEmpty.remove();
  const wrap = document.createElement('div');
  wrap.className = 'generated-image-wrap doc-result-wrap';
  wrap.innerHTML = `<div class="doc-result-title">
      <svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span>${escapeHtml(title)}</span>
    </div>
    <a href="${url}" target="_blank" rel="noopener" class="img-download">Abrir documento (imprimir / PDF)</a>`;
  thread.appendChild(wrap);
  scrollToBottom();
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
    const result = await runConversation(p);
    removeThinking();

    if (result.error) {
      renderMessage('assistant', 'Error del servidor: ' + result.error);
      p.history.pop(); saveStore();
      return;
    }

    (result.artifacts || []).forEach(a => {
      if (a.type === 'image') renderMessage('assistant', 'Imagen generada:', false, [a.url]);
      else if (a.type === 'document') renderDocumentMessage(a.title, a.url);
    });

    if (result.text) {
      renderMessage('assistant', result.text);
      p.history.push({ role: 'assistant', content: result.text, ts: Date.now() });
      saveStore();
    } else if (result.artifacts && result.artifacts.length) {
      // No hubo texto final pero sí se generó contenido: guardamos una nota breve en el historial
      p.history.push({ role: 'assistant', content: '(Se generó contenido visual/documento en el chat)', ts: Date.now() });
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

/* ---------- generación de imágenes (Pollinations.ai) ---------- */

function openImageModal() {
  imagePromptInput.value = '';
  imageResultContainer.innerHTML = '';
  imageLoading.style.display = 'none';
  imageModal.style.display = 'flex';
  setTimeout(() => imagePromptInput.focus(), 50);
}
function closeImageModalFn() { imageModal.style.display = 'none'; }

async function doGenerateImage() {
  const prompt = imagePromptInput.value.trim();
  if (!prompt) { imagePromptInput.focus(); return; }

  imageLoading.style.display = 'block';
  imageResultContainer.innerHTML = '';
  imageGenerateBtn.disabled = true;

  try {
    // Paso 1: Usar Groq para traducir y mejorar el prompt al inglés
    const p = activeProfile();
    const apiKey = p ? p.apiKey : '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';

    imageLoading.innerHTML = '<div class="dots" style="font-size:20px;"><span>.</span><span>.</span><span>.</span></div><p style="margin-top:8px;">Mejorando prompt...</p>';

    const improveResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 150,
        messages: [
          { role: 'system', content: 'You are an expert at writing precise image generation prompts for AI image models. Given a user description (possibly in Spanish), translate it to English and enhance it into a detailed, specific image generation prompt. Output ONLY the English prompt, nothing else. Be concrete about visual details: colors, angles, lighting, materials, style. Do NOT include quotes around the output.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    let enhancedPrompt = prompt; // fallback
    if (improveResp.ok) {
      const improveData = await improveResp.json();
      if (improveData.choices && improveData.choices[0] && improveData.choices[0].message) {
        enhancedPrompt = improveData.choices[0].message.content.trim().replace(/^"|"$/g, '').replace(/'/g, '');
      }
    }

    // Paso 2: Generar imagen con Pollinations FLUX
    const seed = Math.floor(Math.random() * 99999);
    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    const imageUrl = 'https://image.pollinations.ai/prompt/' + encodedPrompt + '?model=flux&width=768&height=768&nologo=true&seed=' + seed + '&enhance=true';

    imageLoading.innerHTML = '<div class="dots" style="font-size:20px;"><span>.</span><span>.</span><span>.</span></div><p style="margin-top:8px;">Generando imagen con FLUX...</p>';

    // Pre-cargar la imagen
    const img = new Image();
    img.onload = () => {
      imageLoading.style.display = 'none';
      imageGenerateBtn.disabled = false;

      // Mostrar en el modal
      const imgWrap = document.createElement('div');
      imgWrap.className = 'image-result-preview';
      imgWrap.innerHTML = `<img src="${imageUrl}" alt="Imagen generada"><div class="image-result-actions">
        <a href="${imageUrl}" download="generada.png" class="img-result-dl-btn">
          <svg class="icon" viewBox="0 0 24 24" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Descargar
        </a>
        <button class="img-result-send-btn" data-url="${imageUrl}">
          <svg class="icon" viewBox="0 0 24 24" style="width:14px;height:14px;"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg> Enviar al chat
        </button>
      </div>`;
      imageResultContainer.appendChild(imgWrap);

      // Botón enviar al chat
      imgWrap.querySelector('.img-result-send-btn').addEventListener('click', () => {
        sendImageToChat(imageUrl, prompt);
        closeImageModalFn();
      });
    };
    img.onerror = () => {
      imageLoading.style.display = 'none';
      imageGenerateBtn.disabled = false;
      imageResultContainer.innerHTML = '<div class="image-error">Error al generar. Intentá de nuevo en unos segundos.</div>';
    };
    img.src = imageUrl;
  } catch (err) {
    imageLoading.style.display = 'none';
    imageGenerateBtn.disabled = false;
    imageResultContainer.innerHTML = '<div class="image-error">Error: ' + (err.message || String(err)) + '</div>';
  }
}

function sendImageToChat(imageUrl, prompt) {
  const p = activeProfile();
  if (!p) return;
  p.history = p.history || [];
  p.history.push({ role: 'user', content: '[Imagen generada] ' + prompt, imageUrls: [imageUrl], ts: Date.now() });
  saveStore();
  renderMessage('user', '[Imagen generada] ' + prompt, false, [imageUrl]);
}

generateImageBtn.addEventListener('click', openImageModal);
closeImageBtn.addEventListener('click', closeImageModalFn);
imageGenerateBtn.addEventListener('click', doGenerateImage);
imagePromptInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doGenerateImage(); } });
document.addEventListener('click', (e) => { if (e.target === imageModal) closeImageModalFn(); });

/* ---------- generación de PDF ---------- */

async function generatePdf() {
  const p = activeProfile();
  if (!p || !p.history || p.history.length === 0) {
    alert('No hay historial para generar un PDF.');
    return;
  }

  const pdfBtn = downloadPdfBtn;
  pdfBtn.disabled = true;
  pdfBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="width:14px;height:14px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> Generando...';

  try {
    // Construir el texto del historial para enviar al LLM
    const historyText = p.history.map(m => {
      const prefix = m.role === 'user' ? (p.name + ': ') : 'Banco: ';
      return prefix + m.content;
    }).join('\n');

    // Pedir al LLM que genere el reporte en Markdown
    const reqMessages = [
      { role: 'system', content: PDF_SYSTEM_PROMPT },
      { role: 'user', content: 'Genera el reporte de diagnóstico en formato Markdown a partir de esta conversación:\n\n' + historyText }
    ];

    let llmResponse;
    if (p.provider === 'google') {
      const contents = reqMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content }]
      }));
      const req = {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + p.apiKey,
        headers: { 'Content-Type': 'application/json' },
        body: {
          systemInstruction: { parts: [{ text: PDF_SYSTEM_PROMPT }] },
          contents: contents,
          generationConfig: { maxOutputTokens: 2000 }
        }
      };
      const resp = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
      const data = await resp.json();
      if (!resp.ok) throw new Error((data.error && data.error.message) || 'HTTP ' + resp.status);
      llmResponse = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.map(part => part.text || '').join('\n').trim();
    } else if (p.provider === 'anthropic') {
      const cleanMsgs = p.history.map(m => ({ role: m.role, content: m.content }));
      const req = {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: { model: 'claude-sonnet-5', max_tokens: 2000, system: PDF_SYSTEM_PROMPT, messages: [{ role: 'user', content: 'Genera el reporte de diagnóstico en formato Markdown:\n\n' + historyText }] }
      };
      const resp = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
      const data = await resp.json();
      if (!resp.ok) throw new Error((data.error && data.error.message) || 'HTTP ' + resp.status);
      llmResponse = data.content && data.content.length ? data.content.map(b => b.text || '').join('\n').trim() : null;
    } else {
      // Groq / OpenAI / Custom (formato OpenAI)
      const apiUrl = p.provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' :
                     p.provider === 'custom' ? p.customUrl : 'https://api.groq.com/openai/v1/chat/completions';
      const apiKey = p.provider === 'openai' ? p.apiKey : (p.provider === 'custom' ? p.apiKey : p.apiKey);
      const model = p.provider === 'openai' ? 'gpt-4o-mini' : (p.provider === 'custom' ? (p.model || 'default') : 'llama-3.3-70b-versatile');
      const req = {
        url: apiUrl,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: { model: model, max_tokens: 2000, messages: [
          { role: 'system', content: PDF_SYSTEM_PROMPT },
          { role: 'user', content: 'Genera el reporte de diagnóstico en formato Markdown:\n\n' + historyText }
        ]}
      };
      const resp = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
      const data = await resp.json();
      if (!resp.ok) throw new Error((data.error && data.error.message) || 'HTTP ' + resp.status);
      llmResponse = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content.trim() : null;
    }

    if (!llmResponse) throw new Error('Respuesta vacía del modelo.');

    // Generar PDF desde el Markdown usando window.print con estilos
    downloadPdfFromMarkdown(llmResponse, p.name);
  } catch (err) {
    alert('Error al generar el PDF: ' + (err.message || String(err)));
  } finally {
    pdfBtn.disabled = false;
    pdfBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="width:14px;height:14px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> PDF';
  }
}

function markdownToHtml(markdown) {
  const lines = markdown.split('\n');
  let html = '<div class="pdf-content">';
  let inList = false;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<br>';
      return;
    }

    if (trimmed.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h1>' + escapeHtml(trimmed.slice(2)) + '</h1>';
    } else if (trimmed.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h2>' + escapeHtml(trimmed.slice(3)) + '</h2>';
    } else if (trimmed.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h3>' + escapeHtml(trimmed.slice(4)) + '</h3>';
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + formatInlineMarkdown(escapeHtml(trimmed.slice(2))) + '</li>';
    } else if (trimmed.match(/^\d+\.\s/)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<p>' + formatInlineMarkdown(escapeHtml(trimmed.replace(/^\d+\.\s/, ''))) + '</p>';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<p>' + formatInlineMarkdown(escapeHtml(trimmed)) + '</p>';
    }
  });

  if (inList) html += '</ul>';
  html += '</div>';
  return html;
}

function buildDocumentHtml(markdown, title) {
  const bodyHtml = markdownToHtml(markdown);
  const dateStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Segoe UI', sans-serif; color: #1a1a2e; padding: 40px; line-height: 1.7; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 22px; color: #0f0f1a; border-bottom: 3px solid #4c56c9; padding-bottom: 10px; margin-bottom: 24px; }
  h2 { font-size: 17px; color: #2d2d44; margin-top: 28px; margin-bottom: 12px; }
  h3 { font-size: 14px; color: #444; margin-top: 20px; }
  p { font-size: 13.5px; margin: 8px 0; }
  ul { margin: 8px 0; padding-left: 20px; }
  li { font-size: 13.5px; margin: 4px 0; }
  .pdf-header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #eee; }
  .pdf-header h1 { border: none; font-size: 20px; margin-bottom: 4px; }
  .pdf-header .pdf-date { font-size: 12px; color: #888; }
  .pdf-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 10px; color: #aaa; text-align: center; }
  strong, b { font-weight: 700; color: #1a1a2e; }
  code { background: #f4f4f4; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<div class="pdf-header">
  <h1>${escapeHtml(title)}</h1>
  <div class="pdf-date">${dateStr}</div>
</div>
${bodyHtml}
<div class="pdf-footer">Generado por DMZ. Verifica siempre con multímetro antes de desoldar.</div>
</body>
</html>`;
}

function downloadPdfFromMarkdown(markdown, profileName) {
  const html = buildDocumentHtml(markdown, 'Reporte de Diagnóstico — ' + profileName);
  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();

  // Esperar a que cargue y luego imprimir
  setTimeout(() => {
    printWindow.print();
    // Cerrar después de imprimir o que el usuario cancele
    printWindow.addEventListener('afterprint', () => { printWindow.close(); });
  }, 500);
}

function formatInlineMarkdown(text) {
  // **bold**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // *italic*
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // `code`
  text = text.replace(/`(.+?)`/g, '<code>$1</code>');
  return text;
}

downloadPdfBtn.addEventListener('click', generatePdf);

/* ---------- chat form ---------- */

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
  providerSelect.value = p ? p.provider : 'google';
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
    google: 'Consíguela gratis en <span class="mono">aistudio.google.com</span> → API Keys.',
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

/* ---------- perfil demo (prueba gratuita) ---------- */

const DEMO_PROFILE_ID = '__demo_groq__';

const demoTryBtn = document.getElementById('demoTryBtn');
demoTryBtn.addEventListener('click', () => {
  // Crear perfil demo si no existe, o usar el existente
  if (!store.profiles[DEMO_PROFILE_ID]) {
    store.profiles[DEMO_PROFILE_ID] = {
      name: 'Prueba Gratis',
      provider: 'groq',
      apiKey: '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',
      customUrl: '',
      avatarImage: null,
      avatarColor: 'linear-gradient(135deg, #5EEAD4, #22B8A0)',
      history: [],
      isDemo: true
    };
    saveStore();
  }
  enterProfile(DEMO_PROFILE_ID);
});

/* ---------- init ---------- */

loadStore();

// La pantalla de perfiles es siempre la de bienvenida al abrir la app.
if (Object.keys(store.profiles).length === 0) {
  profileScreen.style.display = 'flex';
  renderProfileScreen();
  openEditModal(null);
} else {
  updateHeaderUI();
  renderThreadFromHistory();
  showProfileScreen();
}
