/* page2.js - realtime Firestore notes (collection: notes)
   - Anonymous auth already initialized in page2.html
   - Realtime listener with onSnapshot
*/

const NOTES_COLL = 'notes';

function genId(){ return 'n_' + Math.random().toString(36).slice(2,9); }

function driveToDirect(url){
  if(!url || typeof url !== 'string') return url;
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  const id = (m1 && m1[1]) || (m2 && m2[1]);
  if(id) return `https://drive.google.com/uc?export=download&id=${id}`;
  return url;
}

function escapeHtml(s){
  return String(s || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function escapeAttr(s){ return String(s || '').replaceAll('"','%22'); }

const notesListEl = document.getElementById('notesList');
let allNotesCache = [];

function renderNotes(list){
  notesListEl.innerHTML = '';
  if(!Array.isArray(list) || list.length === 0){
    notesListEl.innerHTML = '<div class="small">No notes yet.</div>';
    return;
  }
  list.forEach((n, i) => {
    const el = document.createElement('div');
    el.className = 'note-item';
    el.innerHTML = `
      <div class="meta">
        <div class="title">${escapeHtml(n.title)}</div>
        ${n.description ? `<div class="desc">${escapeHtml(n.description)}</div>` : ''}
        <div class="small">${(n.tags || []).map(t => escapeHtml(t)).join(', ')}</div>
      </div>
      <div class="note-actions">
        <a href="${escapeAttr(n.url)}" ${n.openNewTab ? 'target="_blank" rel="noopener noreferrer"' : ''}><button>Open</button></a>
        <button class="ghost" data-id="${n.id}" data-action="edit">Edit</button>
        <button class="ghost" data-id="${n.id}" data-action="delete">Delete</button>
      </div>
    `;
    notesListEl.appendChild(el);

    el.querySelectorAll('button.ghost').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if(action === 'delete'){
          if(confirm('Delete this note?')) {
            await db.collection(NOTES_COLL).doc(id).delete();
          }
        } else if(action === 'edit'){
          openEdit(id);
        }
      });
    });
  });
}

/* Actions */
async function addNoteFromForm(){
  const title = document.getElementById('noteTitle').value.trim();
  const rawUrl = document.getElementById('noteURL').value.trim();
  const url = driveToDirect(rawUrl);
  const tags = document.getElementById('noteTags').value.split(',').map(s => s.trim()).filter(Boolean);
  const desc = document.getElementById('noteDesc').value.trim();

  if(!title || !url){
    alert('Please provide a title and URL.');
    return;
  }

  const doc = {
    title,
    url,
    description: desc,
    tags,
    openNewTab: true,
    addedAt: Date.now()
  };
  await db.collection(NOTES_COLL).add(doc);
  clearForm();
}

async function deleteNoteById(id){
  await db.collection(NOTES_COLL).doc(id).delete();
}

async function openEdit(id){
  const doc = await db.collection(NOTES_COLL).doc(id).get();
  if(!doc.exists) return;
  const n = doc.data();
  document.getElementById('noteTitle').value = n.title || '';
  document.getElementById('noteURL').value = n.url || '';
  document.getElementById('noteTags').value = (n.tags || []).join(', ');
  document.getElementById('noteDesc').value = n.description || '';
  await db.collection(NOTES_COLL).doc(id).delete();
}

function clearForm(){
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteURL').value = '';
  document.getElementById('noteTags').value = '';
  document.getElementById('noteDesc').value = '';
}

async function exportNotesCsv(){
  const snapshot = await db.collection(NOTES_COLL).orderBy('addedAt','desc').get();
  const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  if(list.length === 0){ alert('No notes to export.'); return; }
  const rows = [['Title','URL','Description','Tags','AddedAt']];
  list.forEach(n => rows.push([n.title, n.url, n.description || '', (n.tags || []).join(';'), new Date(n.addedAt || 0).toISOString()]));
  const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hosa_notes.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function clearAllNotes(){
  if(!confirm('Clear all notes?')) return;
  const snapshot = await db.collection(NOTES_COLL).get();
  const batch = db.batch();
  snapshot.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

/* Search / filter */
function applySearch(){
  const q = document.getElementById('searchNotes').value.trim().toLowerCase();
  let filtered = allNotesCache;
  if(q){
    filtered = allNotesCache.filter(n => {
      const hay = (n.title + ' ' + (n.description || '') + ' ' + (n.tags || []).join(' ')).toLowerCase();
      return hay.includes(q);
    });
  }
  renderNotes(filtered);
}

/* Realtime subscription */
function subscribeNotes(){
  db.collection(NOTES_COLL).orderBy('addedAt','desc').onSnapshot(snapshot => {
    allNotesCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    applySearch();
  }, err => console.error('Notes snapshot error', err));
}

/* Wire up UI after DOM ready */
document.addEventListener('DOMContentLoaded', () => {
  try{
    const addBtn = document.getElementById('addNoteBtn');
    const exportBtn = document.getElementById('exportNotes');
    const clearBtn = document.getElementById('clearNotes');
    const searchEl = document.getElementById('searchNotes');

    if(addBtn) addBtn.addEventListener('click', addNoteFromForm);
    if(exportBtn) exportBtn.addEventListener('click', exportNotesCsv);
    if(clearBtn) clearBtn.addEventListener('click', clearAllNotes);
    if(searchEl) searchEl.addEventListener('input', applySearch);

    subscribeNotes();
    console.info('page2.js realtime initialized');
  }catch(err){
    console.error('Error during page2 init', err);
  }
});
