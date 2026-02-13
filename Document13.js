
/* app.js - Home page (realtime Firestore + anonymous auth)
   Collections/docs used:
   - meta (doc: points)  -> stores points object
   - meta (doc: todos)   -> stores { items: [...] }
*/

const POINTS_DOC = 'points';
const TODOS_DOC = 'todos';
const META_COLL = 'meta';

const TASK_POINTS = {
  textbook: 20,
  review_notes: 15,
  practice: 10
};

const leaderboardEl = document.getElementById('leaderboard');
const todoListEl = document.getElementById('todoList');

function escapeHtml(s){
  return String(s || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

/* Realtime: subscribe to points doc */
function subscribePoints(){
  db.collection(META_COLL).doc(POINTS_DOC)
    .onSnapshot(doc => {
      if(!doc.exists){
        // initialize
        const initial = { Haena:0, Julia:0, Juana:0 };
        db.collection(META_COLL).doc(POINTS_DOC).set(initial);
        renderLeaderboard(initial);
        return;
      }
      renderLeaderboard(doc.data());
    }, err => console.error('Points snapshot error', err));
}

/* Realtime: subscribe to todos doc */
function subscribeTodos(){
  db.collection(META_COLL).doc(TODOS_DOC)
    .onSnapshot(doc => {
      const data = doc.exists ? (doc.data().items || []) : [];
      renderTodos(data);
    }, err => console.error('Todos snapshot error', err));
}

/* Renderers */
function renderLeaderboard(pointsObj){
  const points = pointsObj || { Haena:0, Julia:0, Juana:0 };
  const arr = Object.keys(points).map(name => ({name, points: points[name]}));
  arr.sort((a,b) => b.points - a.points);
  const maxPoints = Math.max(1, ...arr.map(a => a.points));
  leaderboardEl.innerHTML = '';
  arr.forEach((p, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'player';
    wrapper.innerHTML = `
      <div class="meta">
        <div class="name">${idx+1}. ${escapeHtml(p.name)}</div>
        <div class="bar"><i style="width:${Math.round((p.points/maxPoints)*100)}%"></i></div>
      </div>
      <div class="points">${p.points}</div>
    `;
    leaderboardEl.appendChild(wrapper);
  });
}

function renderTodos(todos){
  todoListEl.innerHTML = '';
  if(!todos || todos.length === 0){
    todoListEl.innerHTML = '<div class="small" style="padding:8px;color:#8b5a66">No team tasks yet.</div>';
    return;
  }
  todos.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = 'todo-item';
    item.innerHTML = `
      <div class="text">${escapeHtml(t.text)}</div>
      <div class="meta">${escapeHtml(t.addedBy || '—')}</div>
      <button data-index="${i}" style="background:transparent;border:none;color:#b24b6a;cursor:pointer;font-weight:700">✕</button>
    `;
    item.querySelector('button').addEventListener('click', () => removeTodo(i));
    todoListEl.appendChild(item);
  });
}

/* Actions */
async function addPointsForMember(member, taskKey){
  const pts = TASK_POINTS[taskKey] || 0;
  const docRef = db.collection(META_COLL).doc(POINTS_DOC);
  await db.runTransaction(async tx => {
    const doc = await tx.get(docRef);
    const data = doc.exists ? doc.data() : { Haena:0, Julia:0, Juana:0 };
    if(!(member in data)) data[member] = 0;
    data[member] += pts;
    tx.set(docRef, data);
  });
}

async function resetPoints(){
  const initial = { Haena:0, Julia:0, Juana:0 };
  await db.collection(META_COLL).doc(POINTS_DOC).set(initial);
}

async function addTodo(text, addedBy){
  if(!text || !text.trim()) return;
  const docRef = db.collection(META_COLL).doc(TODOS_DOC);
  await db.runTransaction(async tx => {
    const doc = await tx.get(docRef);
    const items = doc.exists ? (doc.data().items || []) : [];
    items.unshift({ text: text.trim(), addedBy: addedBy || '', createdAt: Date.now() });
    tx.set(docRef, { items });
  });
}

async function removeTodo(index){
  const docRef = db.collection(META_COLL).doc(TODOS_DOC);
  await db.runTransaction(async tx => {
    const doc = await tx.get(docRef);
    const items = doc.exists ? (doc.data().items || []) : [];
    if(index < 0 || index >= items.length) return;
    items.splice(index,1);
    tx.set(docRef, { items });
  });
}

async function clearTodos(){
  await db.collection(META_COLL).doc(TODOS_DOC).set({ items: [] });
}

/* Wire up UI */
document.getElementById('addPointsBtn').addEventListener('click', async () => {
  const member = document.getElementById('memberSelect').value;
  const task = document.getElementById('taskSelect').value;
  await addPointsForMember(member, task);
  const btn = document.getElementById('addPointsBtn');
  btn.disabled = true;
  setTimeout(()=> btn.disabled = false, 400);
});

document.getElementById('resetPoints').addEventListener('click', async () => {
  if(confirm('Reset all points to zero?')) await resetPoints();
});

document.getElementById('addTodoBtn').addEventListener('click', async () => {
  const input = document.getElementById('todoInput');
  const member = document.getElementById('memberSelect').value;
  await addTodo(input.value, member);
  input.value = '';
  input.focus();
});

document.getElementById('todoInput').addEventListener('keydown', (e) => {
  if(e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('addTodoBtn').click();
  }
});

document.getElementById('clearTodos').addEventListener('click', async () => {
  if(confirm('Clear all team to-do items?')) await clearTodos();
});

/* Init realtime subscriptions */
subscribePoints();
subscribeTodos();
