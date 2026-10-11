import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previousCalendarDate,distributionPosition,readingContext,contextBlock,validMarinhaFeed,nextScheduled} from '../context-core.js';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const overview=read('data/overview.json'),latest={...read('data/latest.json'),stations:read('data/latest.json').stations.map(r=>({...r,date:'2026-10-11'}))};
test('same calendar date: leap day never becomes March 1, missing never becomes zero',()=>{
 assert.equal(previousCalendarDate('2024-02-29'),null);assert.equal(previousCalendarDate('2026-10-11'),'2025-10-11');
 const c=readingContext({station:'Cáceres',date:'2026-01-01',level_m:2},{by_date:{},distribution:[[1,1]]});assert.equal(c.previous,null);assert.equal(c.difference,null);
});
test('empirical rank handles ties, negative levels and outside extremes',()=>{
 assert.deepEqual(distributionPosition(0,[[-1,2],[0,3],[2,5]]),{n:10,below:2,equal:3,above:5,percentile:50,min:-1,max:2});
 assert.equal(distributionPosition(-2,[[-1,1],[2,1]]).percentile,0);assert.equal(distributionPosition(3,[[-1,1],[2,1]]).percentile,100);
});
test('2025 values match recovered official monthly daily-mean cells; all rank counts reconcile',()=>{
 const expected={'Cáceres':.68,'Ladário':1.245,'Porto Murtinho':2.375};
 for(const r of latest.stations){const h=overview.stations[r.station],c=readingContext({...r,date:'2026-10-11'},h);assert.equal(c.previous.value,expected[r.station]);assert.equal(c.position.n,h.n);assert.equal(c.position.below+c.position.equal+c.position.above,h.n);assert.ok(contextBlock(r,h).includes('ANA · média diária publicada'));}
});
test('future same-source archive takes precedence; do not borrow nearby dates',()=>{
 const r={station:'Cáceres',date:'2027-10-11',level_m:1.2},h=overview.stations['Cáceres'];
 assert.equal(readingContext(r,h,[{...r,date:'2026-10-10',level_m:1}]).previous,null);
 assert.equal(readingContext(r,h,[{...r,date:'2026-10-11',level_m:1.15}]).previous.value,1.15);
});
test('reject malformed/future/source-mismatched feeds and retain zero',()=>{
 assert.ok(validMarinhaFeed(latest,'2026-10-11'));
 for(const change of [{source_url:'https://fake.example/'},{stations:[]},{stations:latest.stations.map(r=>({...r,date:'2026-02-31'}))},{stations:latest.stations.map(r=>({...r,date:'2026-10-12'}))}])assert.equal(validMarinhaFeed({...latest,...change},'2026-10-11'),false);
 assert.ok(validMarinhaFeed({...latest,stations:latest.stations.map(r=>({...r,level_m:0}))},'2026-10-11'));
});
test('next scheduled attempt respects MT midnight',()=>{assert.equal(nextScheduled(new Date('2026-10-11T14:30:00Z')).toISOString(),'2026-10-11T18:20:00.000Z');assert.equal(nextScheduled(new Date('2026-10-12T02:00:00Z')).toISOString(),'2026-10-12T11:20:00.000Z');});
