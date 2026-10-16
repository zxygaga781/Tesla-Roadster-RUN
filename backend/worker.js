const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validScore(score, startedAt, now) {
  return Number.isInteger(score) && score >= 0 && score <= 1000000 &&
    now >= startedAt && now - startedAt <= 86400000 &&
    score <= Math.ceil((now - startedAt) / 1000 * 19.5) + 30;
}
async function identity(token) {
  if (typeof token !== 'string' || !UUID.test(token)) throw new Error('invalid_player');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function leaderboard(db, player, score) {
  const rows = await db.prepare('SELECT name, best AS score FROM players ORDER BY best DESC, updated_at ASC, id ASC LIMIT 10').all();
  const total = await db.prepare('SELECT COUNT(*) AS total FROM players').first();
  let rank = null;
  if (player) {
    const higher = await db.prepare('SELECT COUNT(*) AS count FROM players WHERE best > ? AND id != ?').bind(score, player).first();
    rank = higher.count + 1;
  }
  const top = [];
  for (const [index, row] of rows.results.entries()) {
    const previous = top[index - 1];
    top.push({ ...row, rank:previous?.score === row.score ? previous.rank : index + 1 });
  }
  return { rank, total:total.total, top };
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim());
    const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Vary':'Origin' };
    if (origin && allowed.includes(origin)) Object.assign(headers, {
      'Access-Control-Allow-Origin':origin,
      'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type',
    });
    const send = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowed.includes(origin)) return send({error:'origin_not_allowed'},403);
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
    const path = new URL(request.url).pathname;
    try {
      if (request.method === 'GET' && path === '/health') return send({ok:true});
      if (request.method === 'GET' && path === '/leaderboard') return send(await leaderboard(env.DB));
      if (request.method !== 'POST' || !['/runs','/scores'].includes(path)) return send({error:'not_found'},404);
      if (!request.headers.get('Content-Type')?.includes('application/json')) return send({error:'json_required'},415);
      const raw = await request.text();
      if (raw.length > 1024) return send({error:'body_too_large'},413);
      let body;
      try { body = JSON.parse(raw); } catch { return send({error:'invalid_json'},400); }
      if (!body || typeof body !== 'object') return send({error:'invalid_json'},400);
      const player = await identity(body.playerToken);
      const now = Date.now();
      if (path === '/runs') {
        const recent = await env.DB.prepare('SELECT COUNT(*) AS count FROM runs WHERE player = ? AND started_at > ?').bind(player, now - 60000).first();
        if (recent.count >= 20) return send({error:'too_many_runs'},429);
        const runId = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO runs(id, player, started_at) VALUES (?, ?, ?)').bind(runId, player, now).run();
        return send({runId},201);
      }
      if (typeof body.runId !== 'string' || !UUID.test(body.runId)) return send({error:'invalid_run'},400);
      const run = await env.DB.prepare('SELECT * FROM runs WHERE id = ? AND player = ?').bind(body.runId, player).first();
      if (!run) return send({error:'run_not_found'},404);
      if (run.score !== null && run.score !== body.score) return send({error:'score_already_saved'},409);
      if (run.score === null && !validScore(body.score, run.started_at, now)) return send({error:'invalid_score'},400);
      await env.DB.batch([
        env.DB.prepare('UPDATE runs SET score = ?, finished_at = ? WHERE id = ? AND player = ? AND score IS NULL').bind(body.score, now, run.id, player),
        env.DB.prepare(`INSERT INTO players(id,name,best,updated_at)
          SELECT player, ?, score, finished_at FROM runs WHERE id = ? AND player = ? AND score IS NOT NULL
          ON CONFLICT(id) DO UPDATE SET best = MAX(players.best, excluded.best),
            updated_at = CASE WHEN excluded.best > players.best THEN excluded.updated_at ELSE players.updated_at END`)
          .bind(`车主·${player.slice(0,8)}`, run.id, player),
      ]);
      // Read the persisted score: concurrent retries cannot change a completed run.
      const saved = await env.DB.prepare('SELECT score FROM runs WHERE id = ?').bind(run.id).first();
      return send({ score:saved.score, ...await leaderboard(env.DB, player, saved.score) });
    } catch (error) {
      if (error.message === 'invalid_player') return send({error:'invalid_player'},400);
      return send({error:'service_unavailable'},503);
    }
  },
};
