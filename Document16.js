/* page1.js - realtime Firestore resources (collection: resources)
   - Realtime listener with onSnapshot
   - Anonymous auth already initialized in page1.html
   - Drive share conversion helper included
*/

const RES_COLL = 'resources';

function genId(){ return 'r_' + Math.random().toString(36).slice(2,9); }

function driveToDirect(url){
  if(!url || typeof url !== 'string') return url;
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  const id = (m1 && m1[1]) || (m2 && m2[1]);
  if(id) return `https://drive.google.com/uc?export=download&id=${id}`;
  return url;
}

function escapeHtml(s){ return String(s || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function escapeAttr(s){ return String(s || '').replaceAll('"','%22'); }

const resourcesListEl = document.getElementById('resourcesList');
const countDisplay = document.getElementById('countDisplay');

function renderResources(resources){
  resourcesListEl.innerHTML = '';
  countDisplay.textContent = resources.length;
  if(resources.length === 0){
    resourcesListEl.innerHTML = '<div class="small">No textbooks found.</div>';
    return;
  }
  resources.forEach(r => {
    const card = document.createElement('div');
    card.className = 'resource-card';
    const tags = (r.tags || []).map(t => `<span class="small">${escapeHtml(t)}</span>`).join(' ');
    card.innerHTML = `
      <div class="meta">
        <div class="title">${escapeHtml(r.title)}</div>
        <div>
          <span class="badge">${escapeHtml(r.type || 'textbook')}</span>
          ${r.description ? `<div class="desc">${escapeHtml(r.description)}</div>` : ''}
          <div class="small">${tags}</div>
        </div>
      </div>
      <div class="resource-actions">
        <a class="open-btn" href="${escapeAttr(r.url)}" ${r.openNewTab ? 'target="_blank" rel="noopener noreferrer"' : ''}>
          <button>Open</button>
        </a>
        <button class="ghost" data-id="${r.id}" data-action="edit">Edit</button>
        <button class="ghost" data-id="${r.id}" data-action="delete">Delete</button>
      </div>
    `;
    resourcesListEl.appendChild(card);

    card.querySelectorAll('button.ghost').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if(action === 'delete'){
          if(confirm('Delete this textbook?')) {
            await db.collection(RES_COLL).doc(id).delete();
          }
        } else if(action === 'edit'){
          openEditForm(id);
        }
      });
    });
  });
}

/* Filters and search */
function applyFilters(allDocs){
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const tagText = document.getElementById('tagInput').value.trim().toLowerCase();
  const tags = tagText ? tagText.split(',').map(s => s.trim()).filter(Boolean) : [];

  let filtered = allDocs.filter(r => (r.type || 'textbook') === 'textbook');

  if(tags.length){
    filtered = filtered.filter(r => {
      const rtags = (r.tags || []).map(t => t.toLowerCase());
      return tags.every(t => rtags.includes(t));
    });
  }

  if(q){
    filtered = filtered.filter(r => {
      const hay = (r.title + ' ' + (r.description || '') + ' ' + (r.tags || []).join(' ')).toLowerCase();
      return hay.includes(q);
    });
  }

  filtered.sort((a,b) => (b.addedAt || 0) - (a.addedAt || 0));
  renderResources(filtered);
}

/* Add / Edit / Delete helpers */
async function addResourceFromForm(){
  const title = document.getElementById('resTitle').value.trim();
  const rawUrl = document.getElementById('resURL').value.trim();
  const url = driveToDirect(rawUrl);
  const tags = document.getElementById('resTags').value.split(',').map(s => s.trim()).filter(Boolean);
  const desc = document.getElementById('resDesc').value.trim();

  if(!title || !url){
    alert('Please provide a title and URL.');
    return;
  }

  const doc = {
    title,
    url,
    type: 'textbook',
    description: desc,
    tags,
    openNewTab: true,
    addedAt: Date.now()
  };
  await db.collection(RES_COLL).add(doc);
  clearAddForm();
}

function clearAddForm(){
  document.getElementById('resTitle').value = '';
  document.getElementById('resURL').value = '';
  document.getElementById('resTags').value = '';
  document.getElementById('resDesc').value = '';
}

async function openEditForm(id){
  const doc = await db.collection(RES_COLL).doc(id).get();
  if(!doc.exists) return;
  const r = doc.data();
  document.getElementById('resTitle').value = r.title || '';
  document.getElementById('resURL').value = r.url || '';
  document.getElementById('resTags').value = (r.tags || []).join(', ');
  document.getElementById('resDesc').value = r.description || '';
  await db.collection(RES_COLL).doc(id).delete();
}

/* Export CSV */
async function exportCsv(){
  const snapshot = await db.collection(RES_COLL).where('type','==','textbook').get();
  const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  if(list.length === 0){ alert('No textbooks to export.'); return; }
  const rows = [['Title','URL','Type','Description','Tags','AddedAt']];
  list.forEach(r => rows.push([r.title, r.url, r.type, r.description || '', (r.tags || []).join(';'), new Date(r.addedAt || 0).toISOString()]));
  const csv = rows.map(r => r.map(cell => `"${String(cell).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hosa_textbooks.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Realtime subscription to resources collection */
let allResourcesCache = [];
function subscribeResources(){
  db.collection(RES_COLL).orderBy('addedAt','desc').onSnapshot(snapshot => {
    allResourcesCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilters(allResourcesCache);
  }, err => console.error('Resources snapshot error', err));
}

/* Wire up UI after DOM ready */
document.addEventListener('DOMContentLoaded', () => {
  try{
    const applyBtn = document.getElementById('applyFilters');
    const resetBtn = document.getElementById('resetFilters');
    const addBtn = document.getElementById('addResourceBtn');
    const exportBtn = document.getElementById('exportCsv');
    const searchInput = document.getElementById('searchInput');

    if(applyBtn) applyBtn.addEventListener('click', () => applyFilters(allResourcesCache));
    if(resetBtn) resetBtn.addEventListener('click', () => {
      if(searchInput) searchInput.value = '';
      const tagEl = document.getElementById('tagInput'); if(tagEl) tagEl.value = '';
      applyFilters(allResourcesCache);
    });
    if(addBtn) addBtn.addEventListener('click', addResourceFromForm);
    if(exportBtn) exportBtn.addEventListener('click', exportCsv);
    if(searchInput) searchInput.addEventListener('input', () => applyFilters(allResourcesCache));

    subscribeResources();
    console.info('page1.js realtime initialized');
  }catch(err){
    console.error('Error during page1 init', err);
  }
});
