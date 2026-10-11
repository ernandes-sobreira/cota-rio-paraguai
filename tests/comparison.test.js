import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {comparisonGraph,comparisonSeries,dailySummary} from '../comparison-core.js';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const overview=read('data/overview.json'),data=read('data/telemetry-daily.json');
data.supplement=read('data/sgb-supplement.json').observations;
test('three distinct official stations and current-year sequences',()=>{const s=comparisonSeries(overview,data,'year',2026);assert.equal(s.length,3);assert.ok(s.every(v=>v.rows.length>240));assert.ok(s.every(v=>v.rows[0].key==='2026-01-01'));});
test('relative comparison uses the same first observed day without changing original levels',()=>{const series=comparisonSeries(overview,data,'year',2026),before=JSON.stringify(series),g=comparisonGraph(series,{relative:true});assert.equal(g.baseline.key,'2026-01-01');g.series.forEach(s=>assert.equal(s.rows[0].mean,0));assert.equal(JSON.stringify(series),before);});
test('daily lines break at missing dates, not at absent February 29 in 2026',()=>{const r=ds=>ds.map(([date,x])=>({date,x,mean:2,min:1,max:3,n:2,sd:1}));const series=rows=>[{name:'A',color:'#000',rows}];const uninterrupted=comparisonGraph(series(r([['2026-02-28',58],['2026-03-01',60]])),{mode:'year'}).svg;assert.equal((uninterrupted.match(/class="station-line"/g)||[]).length,1);const gap=comparisonGraph(series(r([['2026-09-06',249],['2026-10-07',280]])),{mode:'year'}).svg;assert.equal((gap.match(/class="station-line"/g)||[]).length,2);});
test('SGB points stay separate from ANA summaries and curves',()=>{const s=comparisonSeries(overview,data,'year',2026,['Porto Murtinho']),g=comparisonGraph(s);assert.equal(s[0].supplemental.length,5);assert.equal((g.svg.match(/class="supplemental-marker"/g)||[]).length,5);assert.equal(dailySummary(s[0].rows).n,s[0].rows.length);});
test('no selected stations shows a meaningful empty state',()=>{assert.ok(comparisonGraph([]).svg.includes('Selecione uma estação'));});
test('Marinha archive accumulates separate points without changing ANA curves or summaries',()=>{
 const archive=read('data/daily.json'),withArchive={...data,marinhaArchive:archive};
 const plain=comparisonSeries(overview,data,'year',2026),mixed=comparisonSeries(overview,withArchive,'year',2026);
 assert.equal(mixed.reduce((n,s)=>n+s.marine.length,0),archive.filter(r=>r.date.startsWith('2026')).length);
 mixed.forEach((s,i)=>assert.deepEqual(dailySummary(s.rows),dailySummary(plain[i].rows)));
 assert.equal((comparisonGraph(mixed).svg.match(/class="marine-marker"/g)||[]).length,archive.filter(r=>r.date.startsWith('2026')).length);
 const isolated=comparisonGraph([{name:'Cáceres',color:'#147f9b',rows:[],marine:[{date:'2026-10-11',x:284,mean:1.15}]}]);
 assert.ok(isolated.svg.includes('marine-marker'));assert.ok(!isolated.svg.includes('NaN'));
});
