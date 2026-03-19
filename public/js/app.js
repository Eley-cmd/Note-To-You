/* ─── State ──────────────────────────────────────────────────── */
let currentUser = null;
let notes = [];
let selectedFiles = [];
let selectedColor = 'default';
let activeTag = null;
let searchTimer = null;
let currentView = 'feed';
let calendarDate = new Date();
let socket = null;
let profileUser = null;

/* ─── Global Event Delegation (fixes mobile touch) ───────────── */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;
  const noteId = t.dataset.noteId;
  const commentId = t.dataset.commentId;
  const emoji = t.dataset.emoji;

  if (action === 'react')          react(noteId, '❤️');
  if (action === 'toggle-comments') toggleComments(noteId);
  if (action === 'pin')            pinNote(noteId);
  if (action === 'edit')           startEdit(noteId);
  if (action === 'delete-note')    deleteNote(noteId);
  if (action === 'cancel-edit')    cancelEdit(noteId);
  if (action === 'save-edit')      saveEdit(noteId);
  if (action === 'send-comment')   submitComment(noteId);
  if (action === 'delete-comment') deleteComment(noteId, commentId);
  if (action === 'filter-tag')     filterByTag(t.dataset.tag);
  if (action === 'view-profile')   viewProfile(t.dataset.userId, t.dataset.name, t.dataset.avatar);
});
/* ─── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme','dark');
  checkAuth();
});

async function checkAuth() {
  try {
    const res = await fetch('/auth/me');
    const data = await res.json();
    if (data.authenticated) {
      currentUser = data.user;
      showApp();
    } else {
      showLogin();
    }
  } catch { showLogin(); }
}

/* ─── Theme ──────────────────────────────────────────────────── */
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  document.getElementById('theme-btn').textContent = isDark ? '🌙' : '☀️';
}

/* ─── Pages ──────────────────────────────────────────────────── */
function showLogin() {
  const lp = document.getElementById('login-page');
  const ap = document.getElementById('app-page');
  lp.style.display = 'flex';
  lp.style.pointerEvents = 'all';
  ap.style.display = 'none';
}

function showApp() {
  const lp = document.getElementById('login-page');
  const ap = document.getElementById('app-page');
  lp.style.display = 'none';
  lp.style.pointerEvents = 'none';
  ap.style.display = 'flex';
  const name = currentUser.displayName;
  document.getElementById('header-avatar-placeholder').textContent = name[0];
  if (currentUser.avatar) {
    document.getElementById('header-avatar-img').src = currentUser.avatar;
    document.getElementById('header-avatar-img').style.display = 'block';
    document.getElementById('header-avatar-placeholder').style.display = 'none';
  } else {
    document.getElementById('header-avatar-img').style.display = 'none';
    document.getElementById('header-avatar-placeholder').style.display = 'flex';
  }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.getElementById('theme-btn').textContent = isDark ? '☀️' : '🌙';
  setupCompose();
  setupSocket();
  loadNotes();
}

/* ─── Socket.io ──────────────────────────────────────────────── */
function setupSocket() {
  socket = io();
  socket.on('note:new', (note) => {
    if (note.author.id !== currentUser.id) {
      notes.unshift(note);
      renderNotes();
      showToast(`📝 ${note.author.displayName} posted a note`, '');
    }
  });
  socket.on('note:updated', (updated) => {
    const idx = notes.findIndex(n => n._id === updated._id);
    if (idx !== -1) { notes[idx] = updated; renderNotes(); }
  });
  socket.on('note:deleted', (id) => {
    notes = notes.filter(n => n._id !== id);
    renderNotes();
  });
}

/* ─── Tabs ───────────────────────────────────────────────────── */
function switchTab(tab) {
  currentView = tab;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  document.getElementById('feed-view').style.display = tab === 'feed' ? 'block' : 'none';
  document.getElementById('pinned-view').style.display = tab === 'pinned' ? 'block' : 'none';
  document.getElementById('calendar-view').style.display = tab === 'calendar' ? 'block' : 'none';
  document.getElementById('profile-page').style.display = 'none';
  if (tab === 'pinned') loadPinned();
  if (tab === 'calendar') renderCalendar();
}

function showFeed() {
  switchTab('feed');
}

/* ─── Compose ────────────────────────────────────────────────── */
function setupCompose() {
  const textarea = document.getElementById('note-textarea');
  const charCount = document.getElementById('char-count');
  const postBtn = document.getElementById('post-btn');
  const mediaInput = document.getElementById('media-input');

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charCount.textContent = `${len} / 2000`;
    charCount.className = 'char-count' + (len > 1800 ? ' warn' : '') + (len > 2000 ? ' over' : '');
    postBtn.disabled = len === 0 || len > 2000;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px';
  });

  mediaInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    const remaining = 4 - selectedFiles.length;
    files.slice(0, remaining).forEach(f => {
      if (!selectedFiles.find(x => x.name === f.name && x.size === f.size)) selectedFiles.push(f);
    });
    if (files.length > remaining) showToast('Max 4 media files', 'error');
    renderMediaPreview();
    mediaInput.value = '';
  });
}

function selectColor(color) {
  selectedColor = color;
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  document.querySelector(`.color-dot[data-color="${color}"]`).classList.add('selected');
}

function renderMediaPreview() {
  const preview = document.getElementById('media-preview');
  preview.innerHTML = '';
  selectedFiles.forEach((file, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'media-thumb';
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const vid = document.createElement('video');
      vid.src = url; vid.muted = true;
      thumb.appendChild(vid);
    } else {
      const img = document.createElement('img');
      img.src = url; img.alt = 'preview';
      thumb.appendChild(img);
    }
    const rm = document.createElement('button');
    rm.className = 'media-thumb-remove';
    rm.innerHTML = '×';
    rm.onclick = () => { selectedFiles.splice(i,1); renderMediaPreview(); };
    thumb.appendChild(rm);
    preview.appendChild(thumb);
  });
}

async function postNote() {
  const textarea = document.getElementById('note-textarea');
  const postBtn = document.getElementById('post-btn');
  const content = textarea.value.trim();
  if (!content) return;
  postBtn.disabled = true;
  postBtn.textContent = 'Posting…';
  try {
    const formData = new FormData();
    formData.append('content', content);
    formData.append('color', selectedColor);
    const tagsVal = document.getElementById('tags-input').value;
    if (tagsVal) formData.append('tags', tagsVal);
    selectedFiles.forEach(f => formData.append('media', f));
    const res = await fetch('/api/notes', { method: 'POST', body: formData });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const note = await res.json();
    notes.unshift(note);
    renderNotes();
    if (socket) socket.emit('note:broadcast-new', note);
    textarea.value = '';
    textarea.style.height = 'auto';
    selectedFiles = [];
    selectedColor = 'default';
    document.getElementById('tags-input').value = '';
    document.getElementById('char-count').textContent = '0 / 2000';
    selectColor('default');
    renderMediaPreview();
    showToast('Note posted ✓', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    postBtn.disabled = false;
    postBtn.textContent = 'Post';
  }
}

/* ─── Load / Render Notes ────────────────────────────────────── */
async function loadNotes(search = '', tag = '') {
  const feed = document.getElementById('notes-feed');
  feed.innerHTML = `<div class="loading"><div class="loading-spinner"></div>Loading notes…</div>`;
  try {
    let url = '/api/notes?';
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (tag) url += `tag=${encodeURIComponent(tag)}&`;
    const res = await fetch(url);
    notes = await res.json();
    renderNotes();
    renderTagsBar();
  } catch {
    feed.innerHTML = `<div class="empty-state"><p>Could not load notes.</p></div>`;
  }
}

function renderNotes(feedId = 'notes-feed', noteList = null) {
  const list = noteList || notes;
  const feed = document.getElementById(feedId);
  const countEl = document.getElementById(feedId === 'notes-feed' ? 'notes-count' : feedId === 'pinned-feed' ? 'pinned-count' : 'profile-notes-count');
  if (countEl) countEl.textContent = `${list.length} note${list.length !== 1 ? 's' : ''}`;
  if (list.length === 0) {
    feed.innerHTML = `<div class="empty-state"><div class="empty-icon">🍵</div><p>No notes here yet.</p></div>`;
    return;
  }
  feed.innerHTML = '';
  list.forEach((note, idx) => {
    const card = createNoteCard(note, idx);
    feed.appendChild(card);
  });
}

function createNoteCard(note, idx) {
  const card = document.createElement('article');
  card.className = 'note-card';
  card.dataset.id = note._id;
  card.dataset.color = note.color || 'default';
  card.style.animationDelay = `${Math.min(idx * 0.04, 0.4)}s`;

  const isOwner = currentUser && note.author.id === currentUser.id;
  const isPinned = note.pinnedBy && note.pinnedBy.includes(currentUser.id);
  const wasEdited = note.updatedAt && note.createdAt !== note.updatedAt;

  const avatarHtml = note.author.avatar
    ? `<img src="${note.author.avatar}" alt="" class="note-avatar" data-action="view-profile" data-user-id="${note.author.id}" data-name="${escHtml(note.author.displayName)}" data-avatar="${note.author.avatar||''}">`
    : `<div class="note-avatar-placeholder" data-action="view-profile" data-user-id="${note.author.id}" data-name="${escHtml(note.author.displayName)}" data-avatar="">${note.author.displayName[0]}</div>`;

  // Reactions — heart only (IG style)
  const heartCount = (note.reactions || []).filter(r => r.emoji === '❤️').length;
  const iLiked = (note.reactions || []).some(r => r.userId === currentUser.id && r.emoji === '❤️');

  const commentCount = (note.comments || []).length;
  const tagsHtml = (note.tags || []).length > 0
    ? `<div class="note-tags">${note.tags.map(t => `<span class="note-tag" data-action="filter-tag" data-tag="${t}">#${t}</span>`).join('')}</div>`
    : '';

  const mediaHtml = buildMediaHtml(note.media);
  const commentsHtml = buildCommentsHtml(note);

  card.innerHTML = `
    ${isPinned ? '<div class="pinned-badge">📌 Pinned</div>' : ''}
    <div class="note-meta">
      <div class="note-author">
        ${avatarHtml}
        <div class="note-author-info">
          <span class="note-author-name" data-action="view-profile" data-user-id="${note.author.id}" data-name="${escHtml(note.author.displayName)}" data-avatar="${note.author.avatar||''}" style="cursor:pointer">${escHtml(note.author.displayName)}</span>
          <span class="note-time">${formatTime(note.createdAt)}${wasEdited ? ' <span class="edited-badge">edited</span>' : ''}</span>
        </div>
      </div>
      <div class="note-actions">
        <button class="btn-action btn-pin ${isPinned ? 'pinned' : ''}" data-action="pin" data-note-id="${note._id}" title="${isPinned ? 'Unpin' : 'Pin'}">📌</button>
        ${isOwner ? `
        <button class="btn-action" data-action="edit" data-note-id="${note._id}" title="Edit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-action btn-delete" data-action="delete-note" data-note-id="${note._id}" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>` : ''}
      </div>
    </div>
    <div class="note-body" id="body-${note._id}">${escHtml(note.content).replace(/\n/g,'<br>')}</div>
    <div class="edit-form" id="edit-${note._id}">
      <textarea class="edit-textarea" id="edit-ta-${note._id}">${escHtml(note.content)}</textarea>
      <div class="edit-btns">
        <button class="btn-cancel-edit" data-action="cancel-edit" data-note-id="${note._id}">Cancel</button>
        <button class="btn-save" data-action="save-edit" data-note-id="${note._id}">Save</button>
      </div>
    </div>
    ${tagsHtml}
    ${mediaHtml}
    <div class="note-footer">
      <button class="heart-btn ${iLiked ? 'liked' : ''}" id="heart-${note._id}" data-action="react" data-note-id="${note._id}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${iLiked ? '#e74c6f' : 'none'}" stroke="${iLiked ? '#e74c6f' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span id="heart-count-${note._id}">${heartCount > 0 ? heartCount : ''}</span>
      </button>
      <button class="comment-toggle" data-action="toggle-comments" data-note-id="${note._id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span id="comment-count-${note._id}">${commentCount > 0 ? commentCount : ''}</span>
      </button>
    </div>
    ${commentsHtml}
  `;
  return card;
}

function buildCommentsHtml(note) {
  const comments = note.comments || [];
  const commentsListHtml = comments.map(c => {
    const isOwner = currentUser && c.author.id === currentUser.id;
    const avatarHtml = c.author.avatar
      ? `<img src="${c.author.avatar}" alt="" class="comment-avatar">`
      : `<div class="comment-avatar-placeholder">${c.author.displayName[0]}</div>`;
    return `
      <div class="comment-item" id="comment-${c._id}">
        ${avatarHtml}
        <div class="comment-bubble">
          <div class="comment-author">${escHtml(c.author.displayName)}</div>
          <div class="comment-text">${escHtml(c.content)}</div>
          <div class="comment-time">${formatTime(c.createdAt)}</div>
          ${isOwner ? `<button class="comment-delete" data-action="delete-comment" data-note-id="${note._id}" data-comment-id="${c._id}">×</button>` : ''}
        </div>
      </div>`;
  }).join('');
  return `
    <div class="comments-section" id="comments-${note._id}">
      <div id="comments-list-${note._id}">${commentsListHtml}</div>
      <div class="comment-form">
        <input class="comment-input" id="comment-input-${note._id}" placeholder="Write a comment…" onkeydown="if(event.key==='Enter')submitComment('${note._id}')">
        <button class="comment-submit" data-action="send-comment" data-note-id="${note._id}">Send</button>
      </div>
    </div>`;
}

function buildMediaHtml(media) {
  if (!media || media.length === 0) return '';
  const count = Math.min(media.length, 4);
  const items = media.slice(0, 4).map(m => {
    if (m.type === 'video') return `<div class="note-media-item"><video src="${m.url}" controls playsinline preload="metadata"></video></div>`;
    return `<div class="note-media-item"><img src="${m.url}" alt="note image" loading="lazy" onclick="openLightbox('${m.url}')"></div>`;
  }).join('');
  return `<div class="note-media count-${count}">${items}</div>`;
}

/* ─── Tags Bar ───────────────────────────────────────────────── */
function renderTagsBar() {
  const allTags = [...new Set(notes.flatMap(n => n.tags || []))];
  const bar = document.getElementById('tags-bar');
  if (allTags.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = `<span class="tag-pill ${!activeTag ? 'active' : ''}" data-action="filter-tag" data-tag="">All</span>` +
    allTags.map(t => `<span class="tag-pill ${activeTag === t ? 'active' : ''}" data-action="filter-tag" data-tag="${t}">#${t}</span>`).join('');
}

function filterByTag(tag) {
  activeTag = tag || null;
  loadNotes('', activeTag || '');
}

/* ─── Search ─────────────────────────────────────────────────── */
function handleSearch(val) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadNotes(val, activeTag || ''), 400);
}

/* ─── Edit ───────────────────────────────────────────────────── */
function startEdit(id) {
  document.getElementById(`body-${id}`).style.display = 'none';
  document.getElementById(`edit-${id}`).classList.add('active');
  const ta = document.getElementById(`edit-ta-${id}`);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}
function cancelEdit(id) {
  document.getElementById(`body-${id}`).style.display = '';
  document.getElementById(`edit-${id}`).classList.remove('active');
}
async function saveEdit(id) {
  const ta = document.getElementById(`edit-ta-${id}`);
  const content = ta.value.trim();
  if (!content) { showToast('Content cannot be empty', 'error'); return; }
  const saveBtn = document.querySelector(`#edit-${id} .btn-save`);
  saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;
  try {
    const res = await fetch(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const updated = await res.json();
    const idx = notes.findIndex(n => n._id === id);
    if (idx !== -1) notes[idx] = updated;
    renderNotes();
    showToast('Note updated ✓', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    saveBtn.textContent = 'Save'; saveBtn.disabled = false;
  }
}

/* ─── Delete ─────────────────────────────────────────────────── */
async function deleteNote(id) {
  if (!confirm('Delete this note?')) return;
  try {
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    notes = notes.filter(n => n._id !== id);
    const card = document.querySelector(`.note-card[data-id="${id}"]`);
    if (card) { card.style.opacity='0'; card.style.transform='scale(0.97)'; card.style.transition='all 0.25s'; setTimeout(()=>renderNotes(),260); }
    showToast('Note deleted', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

/* ─── Pin ────────────────────────────────────────────────────── */
async function pinNote(id) {
  try {
    const res = await fetch(`/api/notes/${id}/pin`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to pin');
    const data = await res.json();
    const note = notes.find(n => n._id === id);
    if (note) {
      if (data.pinned) { if (!note.pinnedBy) note.pinnedBy = []; note.pinnedBy.push(currentUser.id); }
      else note.pinnedBy = note.pinnedBy.filter(x => x !== currentUser.id);
    }
    renderNotes();
    showToast(data.pinned ? '📌 Note pinned' : 'Unpinned', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

async function loadPinned() {
  const feed = document.getElementById('pinned-feed');
  feed.innerHTML = `<div class="loading"><div class="loading-spinner"></div>Loading…</div>`;
  try {
    const res = await fetch('/api/notes/pinned');
    const pinned = await res.json();
    renderNotes('pinned-feed', pinned);
  } catch { feed.innerHTML = `<div class="empty-state"><p>Could not load pinned notes.</p></div>`; }
}

/* ─── Reactions ──────────────────────────────────────────────── */

const reactingNow = new Set();

async function react(noteId, emoji) {
  const key = `${noteId}-${emoji}`;
  if (reactingNow.has(key)) return;
  reactingNow.add(key);
  try {
    const res = await fetch(`/api/notes/${noteId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji })
    });
    if (!res.ok) throw new Error('Failed');
    const reactions = await res.json();
    const note = notes.find(n => n._id === noteId);
    if (note) note.reactions = reactions;

    // Update heart button in place (IG style)
    const heartCount = reactions.filter(r => r.emoji === '❤️').length;
    const iLiked = reactions.some(r => r.userId === currentUser.id && r.emoji === '❤️');
    const heartBtn = document.getElementById(`heart-${noteId}`);
    const heartCountEl = document.getElementById(`heart-count-${noteId}`);
    if (heartBtn) {
      heartBtn.className = `heart-btn ${iLiked ? 'liked' : ''}`;
      const svg = heartBtn.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', iLiked ? '#e74c6f' : 'none');
        svg.setAttribute('stroke', iLiked ? '#e74c6f' : 'currentColor');
      }
      // Pop animation
      heartBtn.style.transform = 'scale(1.3)';
      setTimeout(() => { heartBtn.style.transform = 'scale(1)'; }, 200);
    }
    if (heartCountEl) heartCountEl.textContent = heartCount > 0 ? heartCount : '';
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    reactingNow.delete(key);
  }
}

/* ─── Comments ───────────────────────────────────────────────── */
function toggleComments(noteId) {
  const section = document.getElementById(`comments-${noteId}`);
  section.classList.toggle('open');
  if (section.classList.contains('open')) {
    document.getElementById(`comment-input-${noteId}`)?.focus();
  }
}
async function submitComment(noteId) {
  const input = document.getElementById(`comment-input-${noteId}`);
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;
  input.disabled = true;
  try {
    const res = await fetch(`/api/notes/${noteId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || 'Failed to post comment');
    }
    const comments = await res.json();
    input.value = '';

    // Update note in memory
    const note = notes.find(n => n._id === noteId);
    if (note) note.comments = comments;

    // Update comment count badge
    const countEl = document.getElementById(`comment-count-${noteId}`);
    if (countEl) countEl.textContent = comments.length > 0 ? comments.length : '';

    // Append new comment to the list
    const list = document.getElementById(`comments-list-${noteId}`);
    const lastComment = comments[comments.length - 1];
    if (list && lastComment) {
      const avatarHtml = currentUser.avatar
        ? `<img src="${currentUser.avatar}" alt="" class="comment-avatar">`
        : `<div class="comment-avatar-placeholder">${currentUser.displayName[0]}</div>`;
      const div = document.createElement('div');
      div.className = 'comment-item';
      div.id = `comment-${lastComment._id}`;
      div.innerHTML = `
        ${avatarHtml}
        <div class="comment-bubble">
          <div class="comment-author">${escHtml(currentUser.displayName)}</div>
          <div class="comment-text">${escHtml(lastComment.content)}</div>
          <div class="comment-time">just now</div>
          <button class="comment-delete" data-action="delete-comment" data-note-id="${noteId}" data-comment-id="${lastComment._id}">×</button>
        </div>`;
      list.appendChild(div);
      div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (err) {
    showToast(err.message, 'error');
    input.value = content; // restore input if failed
  } finally {
    input.disabled = false;
    input.focus();
  }
}

async function deleteComment(noteId, commentId) {
  try {
    const res = await fetch(`/api/notes/${noteId}/comment/${commentId}`, { method: 'DELETE' });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || 'Failed to delete');
    }
    // Remove from DOM
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.2s';
      setTimeout(() => el.remove(), 200);
    }
    // Update note in memory
    const note = notes.find(n => n._id === noteId);
    if (note) {
      note.comments = note.comments.filter(c => c._id !== commentId);
      const countEl = document.getElementById(`comment-count-${noteId}`);
      if (countEl) countEl.textContent = note.comments.length > 0 ? note.comments.length : '';
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ─── Profile ────────────────────────────────────────────────── */
function showProfile(userId, displayName, avatar) {
  const uid = userId || currentUser.id;
  const name = displayName || currentUser.displayName;
  const av = avatar !== undefined ? avatar : currentUser.avatar;
  profileUser = { id: uid, displayName: name, avatar: av };

  document.getElementById('feed-view').style.display = 'none';
  document.getElementById('pinned-view').style.display = 'none';
  document.getElementById('calendar-view').style.display = 'none';
  document.getElementById('profile-page').style.display = 'block';
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const avatarHtml = av
    ? `<img src="${av}" alt="" class="profile-avatar">`
    : `<div class="profile-avatar-placeholder">${name[0]}</div>`;

  document.getElementById('profile-header').innerHTML = `
    ${avatarHtml}
    <div class="profile-info">
      <h2>${escHtml(name)}</h2>
      <p>${uid === currentUser.id ? currentUser.email || '' : ''}</p>
      <div class="profile-stats">
        <div class="profile-stat"><div class="profile-stat-num" id="profile-note-num">—</div><div class="profile-stat-label">Notes</div></div>
      </div>
    </div>`;

  loadProfileNotes(uid);
}

function viewProfile(userId, displayName, avatar) {
  showProfile(userId, displayName, avatar);
}

async function loadProfileNotes(userId) {
  const feed = document.getElementById('profile-feed');
  feed.innerHTML = `<div class="loading"><div class="loading-spinner"></div>Loading…</div>`;
  try {
    const res = await fetch(`/api/notes/user/${userId}`);
    const userNotes = await res.json();
    document.getElementById('profile-note-num').textContent = userNotes.length;
    renderNotes('profile-feed', userNotes);
  } catch { feed.innerHTML = `<div class="empty-state"><p>Could not load notes.</p></div>`; }
}

/* ─── Calendar ───────────────────────────────────────────────── */
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const monthName = calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Get days that have notes
  const noteDays = new Set(notes.map(n => {
    const d = new Date(n.createdAt);
    if (d.getFullYear() === year && d.getMonth() === month) return d.getDate();
    return null;
  }).filter(Boolean));

  const dayLabels = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  grid.innerHTML = `
    <div class="calendar-header">
      <button class="cal-nav" onclick="changeMonth(-1)">← Prev</button>
      <h3>${monthName}</h3>
      <button class="cal-nav" onclick="changeMonth(1)">Next →</button>
    </div>
    ${dayLabels.map(d => `<div class="cal-day-label">${d}</div>`).join('')}
    ${Array(firstDay).fill('<div class="cal-day empty"></div>').join('')}
    ${Array.from({length: daysInMonth}, (_, i) => {
      const day = i + 1;
      const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
      const hasNotes = noteDays.has(day);
      return `<div class="cal-day ${isToday ? 'today' : ''} ${hasNotes ? 'has-notes' : ''}" onclick="selectCalDay(${day}, ${month}, ${year})">${day}</div>`;
    }).join('')}`;
}

function changeMonth(dir) {
  calendarDate.setMonth(calendarDate.getMonth() + dir);
  renderCalendar();
}

function selectCalDay(day, month, year) {
  document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
  event.target.classList.add('selected');
  const selected = new Date(year, month, day);
  const label = selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('cal-selected-label').textContent = label;
  const dayNotes = notes.filter(n => {
    const d = new Date(n.createdAt);
    return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
  });
  renderNotes('cal-notes-feed', dayNotes);
}

/* ─── Lightbox ───────────────────────────────────────────────── */
function openLightbox(url) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.onclick = () => lb.remove();
  lb.innerHTML = `<button class="lightbox-close" onclick="event.stopPropagation();this.parentElement.remove()">×</button><img src="${url}" alt="" onclick="event.stopPropagation()">`;
  document.body.appendChild(lb);
}

/* ─── Toast ──────────────────────────────────────────────────── */
function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 300); }, 2800);
}

/* ─── Helpers ────────────────────────────────────────────────── */
function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff/86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}