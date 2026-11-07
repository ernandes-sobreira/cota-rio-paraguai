import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function render(series,options,width=800){
 const node={setAttribute(){},addEventListener(){},getBoundingClientRect(){return {left:0,width};}};
 const host={clientWidth:width,innerHTML:'',querySelector(){return node;}};
 const ctx={$:()=>host,empty(){},colors:['#2781bd','#087c7d','#bd7830'],DAY:86400000,months:[],esc:s=>String(s??''),num:n=>Number(n).toFixed(2)};
 vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('function chart('),app.indexOf('function showTab('))+';globalThis.draw=chart;',ctx);ctx.draw('test',series,options);return host.innerHTML;
}
test('daily analysis draws source lines with exactly one final station marker',()=>{
 const series=[{label:'ANA',color:'#2781bd',points:[{x:1,y:1},{x:2,y:2}]},{label:'Marinha',color:'#2781bd',gap:1.5,points:[{x:2,y:2},{x:3,y:1}]}];
 for(const width of [330,1000]){const html=render(series,{latestOnly:true,type:'year'},width);assert.equal((html.match(/<circle /g)||[]).length,1);assert.ok(html.includes('latest-observation'));assert.ok(!html.includes('#bd5d36'));assert.ok(!html.includes('NaN'));assert.ok(html.includes('Última observação · Marinha'));}
});
test('daily analysis source setup no longer forces observations into point-only series',()=>{
 assert.ok(app.includes("color:stationColor,gap:DAY*1.5"));assert.ok(app.includes("color:stationColor,gap:Infinity"));assert.ok(app.includes("latestOnly:true"));assert.ok(!app.includes("color:'#bd5d36',gap:0"));
});
test('daily analysis keeps absent consecutive dates disconnected',()=>{
 const html=render([{label:'ANA',color:'#2781bd',gap:1.5,points:[{x:1,y:1},{x:2,y:2},{x:8,y:3}]}],{latestOnly:true,type:'year'});
 const d=html.match(/<path d="([^"]+)" fill="none" stroke="#2781bd"/)[1];assert.equal((d.match(/M/g)||[]).length,2);
});
