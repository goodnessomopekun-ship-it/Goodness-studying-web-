// Runs on Vercel. Finds YouTube videos and writes notes + questions for a topic.
const E = process.env;

async function youtube(topic) {
  const u = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&safeSearch=strict&maxResults=3'
    + '&q=' + encodeURIComponent(topic + ' lesson explained') + '&key=' + E.YOUTUBE_API_KEY;
  const r = await fetch(u);
  if (!r.ok) throw new Error('youtube');
  const j = await r.json();
  return (j.items || []).map(i => ({ id: i.id.videoId, title: i.snippet.title }));
}

async function claude(topic) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': E.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5', max_tokens: 1800,
      messages: [{ role: 'user', content: 'You are a study helper. Topic: "' + topic.replace(/"/g, '') + '". Return only JSON like {"notes":"...","questions":[{"q":"...","a":"..."}]}. notes: clear study notes, 150 to 250 words, short paragraphs. questions: 6 self-test questions with short correct answers.' }]
    })
  });
  if (!r.ok) throw new Error('claude');
  const j = await r.json();
  return JSON.parse(j.content[0].text.replace(/```json|```/g, '').trim());
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const me = await fetch(E.SUPABASE_URL + '/auth/v1/user', { headers: { apikey: E.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } });
    if (!me.ok) return res.status(401).json({ error: 'Please sign in again.' });
    const topic = String((req.body || {}).topic || '').trim().slice(0, 80);
    if (!topic) return res.status(400).json({ error: 'Type a topic first.' });
    const [videos, ai] = await Promise.all([youtube(topic), claude(topic)]);
    res.status(200).json({ notes: ai.notes, questions: ai.questions, videos });
  } catch (e) {
    res.status(500).json({ error: 'Could not generate. Check the keys in Vercel settings.' });
  }
};
