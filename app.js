const sb = supabase.createClient(CFG.url, CFG.key);
const $ = id => document.getElementById(id);
let user = null, topics = [], cur = null, lessons = [], qs = [], cert = null, quiz = null;

function h(tag, a, ...kids) {
  const n = document.createElement(tag);
  for (const k in a || {}) {
    if (k === 'text') n.textContent = a[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), a[k]);
    else n.setAttribute(k, a[k]);
  }
  kids.flat().forEach(c => c && n.append(c));
  return n;
}
const btn = (text, fn, cls = '') => h('button', { class: 'btn ' + cls, text, onclick: fn });
const say = m => { $('msg').textContent = m || ''; };
const userName = () => user.user_metadata?.full_name || user.email;
const ytId = u => ((u || '').match(/(?:v=|youtu\.be\/)([\w-]{11})/) || [])[1];
const safeUrl = u => /^https?:\/\//i.test(u || '');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function act(p) { const { error } = await p; say(error ? error.message : ''); await loadTopic(); }

function authView() {
  const name = h('input', { placeholder: 'Full name (for sign up)', autocomplete: 'name', 'aria-label': 'Full name' });
  const email = h('input', { type: 'email', placeholder: 'Email', autocomplete: 'email', 'aria-label': 'Email' });
  const pass = h('input', { type: 'password', placeholder: 'Password (6+ characters)', autocomplete: 'current-password', 'aria-label': 'Password' });
  const up = async () => {
    if (!name.value.trim()) return say('Enter your full name to create an account.');
    const { error } = await sb.auth.signUp({ email: email.value, password: pass.value, options: { data: { full_name: name.value.trim() } } });
    say(error ? error.message : 'Account created. If asked, confirm your email, then sign in.');
  };
  const inn = async () => { const { error } = await sb.auth.signInWithPassword({ email: email.value, password: pass.value }); say(error ? error.message : ''); };
  $('root').replaceChildren(h('div', { class: 'box auth' }, h('h2', { text: 'Sign in to study' }), name, email, pass,
    h('div', { class: 'row' }, btn('Sign in', inn), btn('Create account', up, 'ghost'))));
}

async function loadTopics() {
  const { data, error } = await sb.from('topics').select('*').order('created_at');
  if (error) return say(error.message);
  topics = data;
  if (!topics.find(t => t.id === cur)) cur = topics[0]?.id || null;
  await loadTopic();
}
async function loadTopic() {
  lessons = []; qs = []; cert = null;
  if (cur) {
    const [l, q, c] = await Promise.all([
      sb.from('lessons').select('*').eq('topic_id', cur).order('created_at'),
      sb.from('questions').select('*').eq('topic_id', cur).order('created_at'),
      sb.from('certificates').select('*').eq('topic_id', cur).maybeSingle()]);
    lessons = l.data || []; qs = q.data || []; cert = c.data;
  }
  render();
}

function render() {
  const t = topics.find(x => x.id === cur);
  const nm = h('input', { placeholder: 'New topic', maxlength: '80', 'aria-label': 'New topic' });
  const addT = async () => {
    if (!nm.value.trim()) return nm.focus();
    const { data, error } = await sb.from('topics').insert({ name: nm.value.trim() }).select().single();
    if (error) return say(error.message);
    cur = data.id; quiz = null; loadTopics();
  };
  const gen = async () => {
    const name = nm.value.trim(); if (!name) return nm.focus();
    say('Finding videos and writing notes. This takes about 20 seconds…');
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ topic: name }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return say(j.error || 'Could not generate.');
      const { data: t, error } = await sb.from('topics').insert({ name, notes: j.notes || '' }).select().single();
      if (error) return say(error.message);
      if (j.questions && j.questions.length) await sb.from('questions').insert(j.questions.map(x => ({ topic_id: t.id, q: String(x.q), a: String(x.a || '') })));
      if (j.videos && j.videos.length) await sb.from('lessons').insert(j.videos.map(v => ({ topic_id: t.id, title: v.title, url: 'https://www.youtube.com/watch?v=' + v.id })));
      say(''); cur = t.id; quiz = null; loadTopics();
    } catch (e) { say('Could not generate right now. Please try again.'); }
  };
  const side = h('aside', { class: 'side' },
    h('p', { text: 'Signed in as ' + userName() }), btn('Sign out', () => sb.auth.signOut(), 'ghost'),
    h('h2', { text: 'My topics', style: 'margin-top:16px' }),
    h('ul', { class: 'topics' }, topics.map(x => h('li', {}, h('button', { text: x.name, 'aria-current': String(x.id === cur), onclick: () => { cur = x.id; quiz = null; loadTopic(); } })))),
    nm, h('div', { class: 'row', style: 'margin-top:8px' }, btn('Type a topic, do the rest', gen), btn('Add blank topic', addT, 'ghost')));
  $('root').replaceChildren(h('div', { class: 'app' }, side,
    h('div', {}, t ? [notesBox(t), lessonsBox(), quiz ? quizBox() : qBox(), certBox(t)] : h('div', { class: 'box empty', text: 'Add your first topic on the left to start.' }))));
}

function notesBox(t) {
  const ta = h('textarea', { rows: '5', 'aria-label': 'Notes', placeholder: 'Write what you learned…' });
  ta.value = t.notes || '';
  ta.addEventListener('change', () => { t.notes = ta.value; sb.from('topics').update({ notes: ta.value }).eq('id', t.id).then(({ error }) => say(error ? error.message : '')); });
  const del = btn('Delete topic', async () => { if (confirm('Delete “' + t.name + '” and everything in it?')) { await sb.from('topics').delete().eq('id', t.id); cur = null; loadTopics(); } }, 'danger');
  return h('section', { class: 'box' }, h('div', { class: 'head' }, h('h2', { text: t.name }), del), h('h3', { text: 'Notes' }), ta);
}

function lessonsBox() {
  const ti = h('input', { placeholder: 'Lesson title', 'aria-label': 'Lesson title', maxlength: '120' });
  const vi = h('input', { placeholder: 'Video link (optional)', 'aria-label': 'Video link' });
  const ni = h('textarea', { rows: '2', placeholder: 'Lesson notes (optional)', 'aria-label': 'Lesson notes' });
  const add = () => {
    if (!ti.value.trim()) return ti.focus();
    let u = vi.value.trim(); if (u && !safeUrl(u)) u = 'https://' + u;
    act(sb.from('lessons').insert({ topic_id: cur, title: ti.value.trim(), url: u, notes: ni.value.trim() }));
  };
  const done = lessons.filter(l => l.done).length;
  const items = lessons.length ? lessons.map((l, i) => {
    const cb = h('input', { type: 'checkbox', style: 'width:auto', 'aria-label': 'Done: ' + l.title });
    cb.checked = l.done;
    cb.addEventListener('change', () => act(sb.from('lessons').update({ done: cb.checked }).eq('id', l.id)));
    return h('li', {}, h('div', { class: 'top' }, h('strong', { text: (i + 1) + '. ' + l.title }), h('label', { class: 'inl' }, cb, ' Done')),
      ytId(l.url) ? h('iframe', { src: 'https://www.youtube-nocookie.com/embed/' + ytId(l.url), title: l.title, allowfullscreen: '', loading: 'lazy', style: 'width:100%;aspect-ratio:16/9;border:0;border-radius:8px;margin:6px 0' }) : safeUrl(l.url) && h('p', { style: 'margin:6px 0' }, h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', text: 'Watch video' })),
      l.notes && h('div', { class: 'muted', text: l.notes }),
      btn('Remove', () => act(sb.from('lessons').delete().eq('id', l.id)), 'danger'));
  }) : h('li', { class: 'empty', text: 'No lessons yet. Add one below.' });
  return h('section', { class: 'box' }, h('div', { class: 'head' }, h('h3', { text: 'Lessons' }), h('span', { class: 'tag', text: done + ' of ' + lessons.length + ' done' })),
    h('ul', { class: 'qlist' }, items),
    h('div', { class: 'stack' }, ti, vi, ni, h('div', { class: 'row' }, btn('Add lesson', add))));
}

function qBox() {
  const q = h('input', { placeholder: 'Write a question for yourself', 'aria-label': 'Question', maxlength: '300' });
  const a = h('textarea', { rows: '2', placeholder: 'Your answer, to check yourself later', 'aria-label': 'Answer' });
  const add = () => { if (!q.value.trim()) return q.focus(); act(sb.from('questions').insert({ topic_id: cur, q: q.value.trim(), a: a.value.trim() })); };
  const items = qs.map(x => h('li', {}, h('div', { class: 'top' }, h('strong', { text: x.q }),
    h('span', { class: 'tag ' + (x.got === true ? 'good' : x.got === false ? 'bad' : ''), text: x.got === true ? 'Got it' : x.got === false ? 'Review' : 'New' })),
    x.a && h('details', {}, h('summary', { text: 'Show answer' }), h('div', { text: x.a })),
    btn('Remove', () => act(sb.from('questions').delete().eq('id', x.id)), 'danger')));
  return h('section', { class: 'box' }, h('div', { class: 'head' }, h('h3', { text: 'Questions for myself' }), qs.length ? btn('Test myself', () => startQuiz(qs), 'ghost') : null),
    q, a, h('div', { class: 'row', style: 'margin-top:8px' }, btn('Add question', add)), h('ul', { class: 'qlist' }, items));
}

function startQuiz(list) { quiz = { list: [...list].sort(() => Math.random() - 0.5), i: 0, shown: false, right: 0, missed: [] }; render(); }
function quizBox() {
  const back = btn('Back to questions', () => { quiz = null; loadTopic(); }, 'ghost');
  if (quiz.i >= quiz.list.length) {
    return h('section', { class: 'box' }, h('h3', { text: 'Test finished' }), h('p', { text: 'You got ' + quiz.right + ' of ' + quiz.list.length + ' right.' }),
      h('div', { class: 'row' }, btn('Test again', () => startQuiz(qs)), quiz.missed.length ? btn('Practise missed (' + quiz.missed.length + ')', () => startQuiz(quiz.missed), 'ghost') : null, back));
  }
  const c = quiz.list[quiz.i];
  const rate = ok => async () => { await sb.from('questions').update({ got: ok }).eq('id', c.id); if (ok) quiz.right++; else quiz.missed.push(c); quiz.i++; quiz.shown = false; render(); };
  return h('section', { class: 'box' }, h('h3', { text: 'Question ' + (quiz.i + 1) + ' of ' + quiz.list.length }),
    h('div', { class: 'card' }, h('p', { class: 'qt', text: c.q }), quiz.shown ? h('p', { class: 'ans', text: c.a || 'You didn’t write an answer for this one.' }) : null),
    h('div', { class: 'row' }, quiz.shown ? [btn('Got it', rate(true)), btn('Not yet', rate(false), 'ghost')] : btn('Show answer', () => { quiz.shown = true; render(); }), back));
}

function download(c) {
  const t = (y, s, f, fill, txt) => '<text x="450" y="' + y + '" font-size="' + s + '" fill="' + fill + '">' + esc(txt) + '</text>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640" width="900" height="640"><rect width="900" height="640" fill="#0a0a0a"/><rect x="24" y="24" width="852" height="592" fill="none" stroke="#e0b234" stroke-width="4"/><rect x="40" y="40" width="820" height="560" fill="none" stroke="#c8102e" stroke-width="2"/><g font-family="Georgia,serif" text-anchor="middle">'
    + t(130, 22, 0, '#e0b234', 'Goodness Studying Web') + t(200, 44, 0, '#f4efe4', 'Certificate of completion') + t(270, 20, 0, '#a79f92', 'This certifies that')
    + t(340, 48, 0, '#e0b234', c.name) + t(400, 20, 0, '#a79f92', 'has completed') + t(460, 34, 0, '#f4efe4', c.topic_name)
    + t(540, 18, 0, '#a79f92', 'Issued ' + new Date(c.issued_at).toLocaleDateString(undefined, { dateStyle: 'long' })) + t(570, 18, 0, '#a79f92', 'Certificate number ' + c.no) + '</g></svg>';
  h('a', { href: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), download: 'certificate-' + c.no + '.svg' }).click();
}
function certBox(t) {
  const ready = lessons.length && lessons.every(l => l.done) && qs.every(x => x.got === true);
  const kids = [h('h3', { text: 'Certificate' })];
  if (cert) {
    kids.push(h('div', { class: 'cert' }, h('div', { class: 'gold', text: 'Certificate of completion' }), h('div', { text: 'This certifies that' }), h('div', { class: 'cn', text: cert.name }),
      h('div', { text: 'has completed' }), h('div', { class: 'ct', text: cert.topic_name }),
      h('div', { text: 'Issued ' + new Date(cert.issued_at).toLocaleDateString(undefined, { dateStyle: 'long' }) }), h('div', { text: 'Certificate number ' + cert.no })),
      h('div', { class: 'row' }, btn('Download certificate', () => download(cert)), h('a', { class: 'btn ghost', href: 'verify.html?no=' + encodeURIComponent(cert.no), text: 'Open verify page' })));
  } else if (ready) kids.push(btn('Get my certificate', () => act(sb.rpc('issue_certificate', { p_topic: t.id }))));
  else kids.push(h('p', { class: 'muted', text: 'To earn it, finish every lesson and mark every question “Got it” in a test.' }));
  return h('section', { class: 'box' }, kids);
}

sb.auth.onAuthStateChange((ev, s) => {
  if (ev === 'TOKEN_REFRESHED') return;
  user = s?.user || null;
  user ? loadTopics() : authView();
});
