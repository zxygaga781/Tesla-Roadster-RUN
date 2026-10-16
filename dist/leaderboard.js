const API = 'https://tesla-can-fly-scores.pages.dev';
const TIMEOUT = 10000;
let playerToken;
try { playerToken = localStorage.getItem('tesla-fly-player'); } catch {}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(playerToken || '')) playerToken = crypto.randomUUID();
try { localStorage.setItem('tesla-fly-player', playerToken); } catch {}
async function request(path, body) {
  if (!API) throw new Error('排行榜尚未启用');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(API + path, { method:body ? 'POST' : 'GET',
      headers:body ? {'Content-Type':'application/json'} : {},
      body:body ? JSON.stringify(body) : undefined, signal:controller.signal });
    if (!response.ok) throw new Error('排行榜暂时不可用');
    return await response.json();
  } finally { clearTimeout(timer); }
}
export function beginRankedRun() {
  // Resolve failures so a slow/offline leaderboard never prevents playing.
  return request('/runs', {playerToken}).catch(() => null);
}
export async function finishRankedRun(start, score) {
  const session = await start;
  if (!session) throw new Error('本局未联网，成绩未上传');
  return request('/scores', {playerToken, runId:session.runId, score});
}
