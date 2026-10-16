import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { validScore } from '../backend/worker.js';

function setup() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../backend/migrations/0001_scores.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(query) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return sql.prepare(query).get(...values) || null; },
        async all() { return {results:sql.prepare(query).all(...values)}; },
        async run() { return sql.prepare(query).run(...values); },
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const r = await Promise.all(statements.map(s => s.run())); sql.exec('COMMIT'); return r; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  async function call(path, body, origin = 'https://zxygaga781.github.io') {
    const response = await worker.fetch(new Request('https://scores.test'+path, {
      method:body ? 'POST' : 'GET', headers:{'Content-Type':'application/json','Origin':origin},
      body:body ? JSON.stringify(body) : undefined,
    }), {DB, ALLOWED_ORIGINS:'https://zxygaga781.github.io'});
    return {status:response.status, headers:response.headers, body:await response.json()};
  }
  async function finish(playerToken, score) {
    const {body:{runId}} = await call('/runs', {playerToken});
    sql.prepare('UPDATE runs SET started_at = ? WHERE id = ?').run(Date.now()-60000, runId);
    return {runId, ...await call('/scores', {playerToken,runId,score})};
  }
  return {sql,call,finish};
}
test('ranking uses personal bests, ties share rank, and retries do not create duplicate scores', async () => {
  const {sql,call,finish} = setup();
  const a = crypto.randomUUID(), b = crypto.randomUUID(), c = crypto.randomUUID();
  const first = await finish(a,100);
  assert.equal(first.status,200); assert.equal(first.body.rank,1);
  assert.equal((await finish(b,200)).body.rank,1);
  assert.equal((await finish(c,200)).body.rank,1);
  const lower = await finish(a,50);
  assert.equal(lower.body.rank,3); assert.equal(lower.body.total,3);
  assert.deepEqual(lower.body.top.map(r=>r.rank),[1,1,3]);
  assert.deepEqual(lower.body.top.map(r=>r.score),[200,200,100]);
  assert.equal((await call('/scores',{playerToken:a,runId:lower.runId,score:50})).status,200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM runs WHERE score IS NOT NULL').get().n,4);
  assert.equal((await call('/scores',{playerToken:a,runId:lower.runId,score:999})).status,409);
  assert.equal((await call('/scores',{playerToken:b,runId:lower.runId,score:50})).status,404);
  sql.close();
});
test('rejects invalid scores and origins; public leaderboard does not leak player credentials', async () => {
  const {sql,call,finish} = setup();
  assert.equal(validScore(-1,0,1000),false);
  assert.equal(validScore(1.5,0,1000),false);
  assert.equal(validScore(10000,0,1000),false);
  assert.equal(validScore(20,0,1000),true);
  assert.equal(validScore(20,0,86400001),false);
  assert.equal((await call('/runs',{playerToken:'bad'})).status,400);
  assert.equal((await call('/leaderboard',null,'https://unrelated.test')).status,403);
  const token = crypto.randomUUID(); await finish(token,50);
  const board = await call('/leaderboard');
  assert.equal(board.headers.get('access-control-allow-origin'),'https://zxygaga781.github.io');
  assert.equal(JSON.stringify(board.body).includes(token),false);
  assert.deepEqual(Object.keys(board.body.top[0]).sort(),['name','rank','score']);
  sql.close();
});
