import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calendarX,historySVG,stationCard,rulerSVG,localToday} from '../dashboard-core.js';
const overview=JSON.parse(readFileSync(new URL('../data/overview.json',import.meta.url)));
const h=overview.stations['Cáceres'];
test('calendar alignment preserves February 29 and all other dates',()=>{assert.equal(calendarX('2020-02-29'),59);assert.equal(calendarX('2019-03-01'),60);assert.equal(calendarX('2020-03-01'),60);assert.equal(calendarX('12-31'),365);});
test('current reading is a separate marker and never changes historical statistics',()=>{
 const before=JSON.stringify(h),current={date:'2026-10-11',level_m:1.15};
 for(const mode of ['season','history']){const chart=historySVG(h,current,mode,330,'Cáceres');assert.ok(chart.svg.includes('latest-marker'));assert.ok(chart.svg.includes('11/10 · 1,15 m'));assert.ok(!chart.svg.includes('NaN'));assert.deepEqual(chart.rows,historySVG(h,null,mode,330).rows);}
 assert.equal(JSON.stringify(h),before);
});
test('zero and negative readings are drawn and unknown time is explicit',()=>{
 for(const level of [0,-.29]){const r={date:'2026-10-11',level_m:level};assert.ok(historySVG(h,r,'history',330).svg.includes('latest-marker'));assert.ok(!rulerSVG(level).includes('NaN'));const card=stationCard('Cáceres',h,r,0);assert.ok(card.includes('Horário não informado pela fonte'));assert.ok(card.includes('Não é profundidade'));}
});
test('MT date uses local midnight, not UTC midnight',()=>{assert.equal(localToday(new Date('2026-10-12T02:00:00Z')),'2026-10-11');assert.equal(localToday(new Date('2026-10-12T05:00:00Z')),'2026-10-12');});
test('published HTML works before JavaScript or data fetch',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.equal((html.match(/class="station-panel"/g)||[]).length,3);assert.equal((html.match(/class="history-svg"/g)||[]).length,3);assert.equal((html.match(/class="ruler-svg"/g)||[]).length,3);assert.equal((html.match(/class="latest-marker"/g)||[]).length,3);assert.ok(html.includes('id="verified-at"'));assert.ok(!html.includes('{{'));assert.ok(html.includes('Horário não informado pela fonte'));
 const code=readFileSync(new URL('../dashboard.js',import.meta.url),'utf8');assert.ok(!code.includes('AbortSignal.timeout'));assert.ok(!/^import /m.test(code));
});
