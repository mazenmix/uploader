const $ = (s) => document.querySelector(s);
const els = {
  loginModal: $('#loginModal'), loginForm: $('#loginForm'), adminKey: $('#adminKey'), loginError: $('#loginError'),
  logoutBtn: $('#logoutBtn'), dropZone: $('#dropZone'), fileInput: $('#fileInput'), selectBtn: $('#selectBtn'),
  uploadQueue: $('#uploadQueue'), fileList: $('#fileList'), searchInput: $('#searchInput'), refreshBtn: $('#refreshBtn'),
  storageUsed: $('#storageUsed'), storageMeter: $('#storageMeter'), storageCaption: $('#storageCaption'), fileCount: $('#fileCount'), toastWrap: $('#toastWrap')
};

const PART_SIZE = 10 * 1024 * 1024;
let token = sessionStorage.getItem('mx_admin_token') || '';
let files = [];

function authHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${token}` };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: authHeaders(options.headers || {})
  });
  if (response.status === 401) throw new Error('AUTH');
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  els.toastWrap.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function iconFor(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['png','jpg','jpeg','gif','webp','svg','heic'].includes(ext)) return '▧';
  if (['mp4','mov','webm','mkv','avi'].includes(ext)) return '▶';
  if (['mp3','wav','m4a','aac','ogg','flac'].includes(ext)) return '♪';
  if (ext === 'pdf') return 'PDF';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'ZIP';
  if (['apk','exe','msi','dmg','pkg'].includes(ext)) return 'APP';
  return 'FILE';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

async function loadFiles() {
  try {
    const data = await api('/api/files');
    files = data.files || [];
    const used = data.storage?.used || 0;
    const ref = data.storage?.freeTierReference || 10 * 1024 * 1024 * 1024;
    els.storageUsed.textContent = formatBytes(used);
    els.storageMeter.style.width = `${Math.min(100, used / ref * 100)}%`;
    els.storageCaption.textContent = `${formatBytes(used)} used • 10 GB free-tier reference`;
    els.fileCount.textContent = String(data.storage?.count ?? files.length);
    renderFiles();
    els.loginModal.classList.add('hidden');
    els.loginError.textContent = '';
  } catch (error) {
    if (error.message === 'AUTH') {
      sessionStorage.removeItem('mx_admin_token');
      token = '';
      els.loginModal.classList.remove('hidden');
      els.loginError.textContent = 'Admin key is not correct.';
      return;
    }
    toast(error.message, 'error');
  }
}

function renderFiles() {
  const q = els.searchInput.value.trim().toLowerCase();
  const visible = files.filter((file) => !q || file.name.toLowerCase().includes(q) || file.id.toLowerCase().includes(q));
  if (!visible.length) {
    els.fileList.innerHTML = `<div class="empty-state">${q ? 'No matching files.' : 'No uploads yet. Drop your first file above.'}</div>`;
    return;
  }
  els.fileList.innerHTML = visible.map((file) => `
    <div class="file-row" data-id="${escapeHtml(file.id)}">
      <div class="file-main">
        <div class="file-icon">${iconFor(file.name)}</div>
        <div class="file-text"><div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div><div class="file-id">/f/${escapeHtml(file.id)}</div></div>
      </div>
      <div class="file-size">${formatBytes(file.size)}</div>
      <div class="file-date">${formatDate(file.uploaded)}</div>
      <div class="file-actions">
        <button class="icon-btn" data-action="copy" title="Copy link">⧉</button>
        <button class="icon-btn" data-action="open" title="Open">↗</button>
        <button class="icon-btn" data-action="rename" title="Rename">✎</button>
        <button class="icon-btn danger" data-action="delete" title="Delete">×</button>
      </div>
    </div>`).join('');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function queueItem(file) {
  els.uploadQueue.hidden = false;
  const id = `q-${crypto.randomUUID()}`;
  const node = document.createElement('div');
  node.className = 'queue-item';
  node.id = id;
  node.innerHTML = `<div class="queue-row"><div class="queue-name"></div><div class="queue-meta">0%</div></div><div class="progress"><i></i></div>`;
  node.querySelector('.queue-name').textContent = file.name;
  els.uploadQueue.appendChild(node);
  return {
    node,
    setProgress(percent, text) {
      node.querySelector('.progress i').style.width = `${Math.max(0, Math.min(100, percent))}%`;
      node.querySelector('.queue-meta').textContent = text || `${Math.round(percent)}%`;
    },
    done(text = 'Complete') { this.setProgress(100, text); setTimeout(() => { node.remove(); if (!els.uploadQueue.children.length) els.uploadQueue.hidden = true; }, 2400); },
    fail(text = 'Failed') { node.querySelector('.queue-meta').textContent = text; node.querySelector('.queue-meta').style.color = '#ff7b86'; }
  };
}

async function uploadPart(upload, file, partNumber, start, end) {
  const path = `/api/upload?action=part&key=${encodeURIComponent(upload.key)}&uploadId=${encodeURIComponent(upload.uploadId)}&partNumber=${partNumber}`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await api(path, { method: 'PUT', body: file.slice(start, end) });
    } catch (error) {
      lastError = error;
      if (error.message === 'AUTH') throw error;
      await new Promise((resolve) => setTimeout(resolve, 450 * attempt));
    }
  }
  throw lastError;
}

async function uploadFile(file) {
  const ui = queueItem(file);
  let upload;
  try {
    upload = await api('/api/upload?action=create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type || 'application/octet-stream', size: file.size })
    });

    const partCount = Math.ceil(file.size / PART_SIZE);
    const parts = new Array(partCount);
    let completedBytes = 0;
    let nextPart = 0;
    const workers = Math.min(3, partCount);

    async function worker() {
      while (true) {
        const index = nextPart++;
        if (index >= partCount) return;
        const start = index * PART_SIZE;
        const end = Math.min(file.size, start + PART_SIZE);
        const uploadedPart = await uploadPart(upload, file, index + 1, start, end);
        parts[index] = uploadedPart;
        completedBytes += end - start;
        ui.setProgress(completedBytes / file.size * 100, `${Math.round(completedBytes / file.size * 100)}%`);
      }
    }

    await Promise.all(Array.from({ length: workers }, worker));

    const completed = await api(`/api/upload?action=complete&key=${encodeURIComponent(upload.key)}&uploadId=${encodeURIComponent(upload.uploadId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts })
    });

    ui.done('Complete');
    await copyText(completed.directUrl);
    toast(`${file.name} uploaded — link copied`);
    await loadFiles();
  } catch (error) {
    ui.fail(error.message === 'AUTH' ? 'Locked' : 'Failed');
    if (upload?.uploadId) {
      api(`/api/upload?action=abort&key=${encodeURIComponent(upload.key)}&uploadId=${encodeURIComponent(upload.uploadId)}`, { method: 'DELETE' }).catch(() => {});
    }
    if (error.message === 'AUTH') {
      token = '';
      sessionStorage.removeItem('mx_admin_token');
      els.loginModal.classList.remove('hidden');
    } else {
      toast(`${file.name}: ${error.message}`, 'error');
    }
  }
}

async function uploadFiles(fileList) {
  const selected = [...fileList].filter((f) => f.size > 0);
  for (const file of selected) await uploadFile(file);
  els.fileInput.value = '';
}

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  token = els.adminKey.value.trim();
  if (!token) return;
  sessionStorage.setItem('mx_admin_token', token);
  els.loginError.textContent = '';
  await loadFiles();
});

els.logoutBtn.addEventListener('click', () => {
  token = '';
  sessionStorage.removeItem('mx_admin_token');
  els.adminKey.value = '';
  els.loginModal.classList.remove('hidden');
});

els.selectBtn.addEventListener('click', (e) => { e.stopPropagation(); els.fileInput.click(); });
els.dropZone.addEventListener('click', (e) => { if (e.target === els.dropZone) els.fileInput.click(); });
els.dropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') els.fileInput.click(); });
els.fileInput.addEventListener('change', () => uploadFiles(els.fileInput.files));

for (const eventName of ['dragenter','dragover']) {
  els.dropZone.addEventListener(eventName, (e) => { e.preventDefault(); els.dropZone.classList.add('dragover'); });
}
for (const eventName of ['dragleave','drop']) {
  els.dropZone.addEventListener(eventName, (e) => { e.preventDefault(); els.dropZone.classList.remove('dragover'); });
}
els.dropZone.addEventListener('drop', (e) => uploadFiles(e.dataTransfer.files));
els.searchInput.addEventListener('input', renderFiles);
els.refreshBtn.addEventListener('click', loadFiles);

els.fileList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const row = event.target.closest('.file-row');
  if (!button || !row) return;
  const file = files.find((item) => item.id === row.dataset.id);
  if (!file) return;
  const link = `${location.origin}/f/${file.id}`;

  try {
    switch (button.dataset.action) {
      case 'copy':
        await copyText(link);
        toast('Direct link copied');
        break;
      case 'open':
        window.open(link, '_blank', 'noopener');
        break;
      case 'rename': {
        const name = prompt('New file name', file.name);
        if (!name || name.trim() === file.name) return;
        await api('/api/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: file.id, name: name.trim() }) });
        toast('File renamed');
        await loadFiles();
        break;
      }
      case 'delete':
        if (!confirm(`Delete ${file.name}?`)) return;
        await api('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: file.id }) });
        toast('File deleted');
        await loadFiles();
        break;
    }
  } catch (error) {
    toast(error.message, 'error');
  }
});

if (token) loadFiles();
