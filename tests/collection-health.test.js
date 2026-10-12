import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {STATIONS, timeBR} from '../dashboard-core.js';
import {
  marinhaFreshness, collectionOverdue, sourceHealth,
  validMarinhaFeed, canReplaceMarinhaFeed,
} from '../context-core.js';

const TODAY = '2026-10-12';
const NOW = new Date('2026-10-12T20:00:00Z');
const SOURCE = 'https://www.marinha.mil.br/chn-6/';

function feed(overrides = {}) {
  return {
    schema_version: 2,
    source_url: SOURCE,
    checked_at: '2026-10-12T14:30:00Z',
    last_success_at: '2026-10-12T14:30:00Z',
    last_direct_attempt_at: '2026-10-12T14:30:00Z',
    fetch_status: 'ok',
    direct_status: 'ok',
    stations: STATIONS.map(station => ({station, date: TODAY, level_m: 1.16, variation_m: 0.01})),
    error: null,
    ...overrides,
  };
}

test('freshness describes actual observation dates and detects missing stations', () => {
  assert.deepEqual(marinhaFreshness(feed(), TODAY), {stale: [], text: 'Marinha: leituras de hoje'});
  for (const stations of [
    feed().stations.map((r, i) => i === 0 ? {...r, date: '2026-10-11'} : r),
    feed().stations.slice(1),
  ]) {
    const health = marinhaFreshness(feed({stations}), TODAY);
    assert.deepEqual(health.stale, [STATIONS[0]]);
    assert.match(health.text, /sem leitura de hoje/);
    assert.ok(health.text.includes(STATIONS[0]));
  }
  assert.deepEqual(marinhaFreshness({}, TODAY).stale, STATIONS);
});

test('a missed scheduled attempt remains unconfirmed even with recent old data', () => {
  const latest = feed({last_direct_attempt_at: '2026-10-11T18:20:00Z'});
  assert.equal(collectionOverdue(latest, new Date('2026-10-12T11:19:59Z')), false);
  assert.equal(collectionOverdue(latest, new Date('2026-10-12T11:20:00Z')), true);
  latest.last_direct_attempt_at = '2026-10-12T11:20:00Z';
  assert.equal(collectionOverdue(latest, new Date('2026-10-12T11:20:00Z')), false);
  assert.equal(collectionOverdue(latest, new Date('2026-10-12T12:20:00Z')), true);
  latest.last_direct_attempt_at = '2026-10-12T12:21:00Z';
  assert.equal(collectionOverdue(latest, new Date('2026-10-12T12:21:00Z')), false);
  assert.equal(collectionOverdue({}, new Date('2026-10-12T18:21:00Z')), true);
});

test('source health keeps stale data, direct failures, ANA date, and overdue schedule visible', () => {
  const latest = feed({fetch_status: 'error', direct_status: 'unavailable',
    checked_at: '2026-10-12T18:30:00Z',
    stations: feed().stations.map(r => ({...r, date: '2026-10-11'})),
  });
  const html = sourceHealth(latest, {status: 'partial_error', fetched_at: '2026-10-11T16:00:00Z'}, NOW);
  assert.match(html, /Marinha sem leitura de hoje/);
  assert.match(html, /Última consulta direta falhou/);
  assert.match(html, /dados anteriores preservados/);
  assert.match(html, /Tentativa prevista anterior ainda sem confirmação/);
  assert.match(html, /ANA · última coleta bem-sucedida/);
  assert.match(html, /Consulta ANA parcial/);
  assert.match(html, /sem consultar as fontes oficiais/);
  assert.doesNotMatch(html, /Fontes consultadas hoje|ANA consultada hoje|Marinha consultada hoje/);
});

test('a later failure replaces an older successful feed without regressing readings', () => {
  const current = feed();
  const failed = feed({checked_at: '2026-10-12T18:30:00Z', last_direct_attempt_at: '2026-10-12T18:30:00Z',
    fetch_status: 'error', direct_status: 'unavailable', error: 'HTTP 403'});
  assert.equal(validMarinhaFeed(failed, TODAY, NOW), true);
  assert.equal(canReplaceMarinhaFeed(failed, current, TODAY, NOW), true);
  assert.equal(canReplaceMarinhaFeed(current, failed, TODAY, NOW), false);
  assert.equal(canReplaceMarinhaFeed({...failed, stations: failed.stations.map(r => ({...r, date: '2026-10-11'}))}, current, TODAY, NOW), false);
  assert.equal(canReplaceMarinhaFeed(current, current, TODAY, NOW), false);
});

test('feed validation rejects every future status timestamp and impossible observation dates', () => {
  assert.equal(validMarinhaFeed(feed(), TODAY, NOW), true);
  for (const key of ['last_success_at', 'checked_at', 'last_direct_attempt_at', 'last_verified_web_at']) {
    for (const invalid of ['2026-10-12T20:00:01Z', 'not-a-date']) {
      assert.equal(validMarinhaFeed(feed({[key]: invalid}), TODAY, NOW), false, `${key}: ${invalid}`);
      assert.equal(canReplaceMarinhaFeed(feed({[key]: invalid}), feed(), TODAY, NOW), false);
    }
  }
  for (const date of ['2026-10-13', '2026-02-31']) {
    assert.equal(validMarinhaFeed(feed({stations: feed().stations.map(r => ({...r, date}))}), TODAY, NOW), false);
  }
  assert.equal(validMarinhaFeed(feed({stations: feed().stations.map(r => ({...r, level_m: 0}))}), TODAY, NOW), true);
  assert.equal(validMarinhaFeed(feed({stations: [feed().stations[0], feed().stations[0], feed().stations[2]]}), TODAY, NOW), false);
});

test('dashboard refresh says published files were checked and labels ANA by last collection', async () => {
  const source = readFileSync(new URL('../dashboard-client.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function update()');
  const end = source.indexOf("\n document.querySelectorAll('[data-mode]')", start);
  assert.ok(start >= 0 && end > start, 'Dashboard update function must be available for the offline harness');
  const current = feed({stations: feed().stations.map(r => ({...r, date: '2026-10-11'}))});
  const failed = {...current, checked_at: '2026-10-12T18:30:00Z', fetch_status: 'error', direct_status: 'unavailable'};
  const telemetry = {unit: 'm', year: 2026, fetched_at: '2026-10-11T16:00:00Z', status: 'ok'};
  const requested = [];
  const context = {
    latest: current, telemetry, busy: false, refresh: {disabled: false}, status: {},
    marinhaArchive: [], fetch: () => {throw Error('Real fetch must not be used');},
    render: () => {}, localStorage: {setItem: () => {}},
    validFeed: () => true, validTelemetry: () => true,
    timeBR, marinhaFreshness: value => marinhaFreshness(value, TODAY),
    fetchJSON: async url => {
      requested.push(url);
      if (url.includes('telemetry-daily.json')) return telemetry;
      if (url.includes('latest.json')) return failed;
      if (url.includes('daily.json')) return [];
      throw Error('Unexpected URL: ' + url);
    },
  };
  context.canReplace = value => canReplaceMarinhaFeed(value, context.latest, TODAY, NOW);
  vm.runInNewContext(source.slice(start, end) + '\nresult = update();', context);
  await context.result;
  assert.equal(requested.length, 5);
  assert.equal(context.latest.fetch_status, 'error');
  assert.match(context.status.textContent, /Arquivos publicados consultados/);
  assert.match(context.status.textContent, /Marinha sem leitura de hoje/);
  assert.match(context.status.textContent, /coleta Marinha falhou/);
  assert.match(context.status.textContent, /ANA: última coleta/);
  assert.ok(context.status.textContent.includes(timeBR(telemetry.fetched_at)));
  assert.doesNotMatch(context.status.textContent, /Fontes consultadas hoje|ANA consultada hoje|Marinha consultada hoje/);
  assert.equal(context.refresh.disabled, false);
  assert.equal(context.busy, false);
});
