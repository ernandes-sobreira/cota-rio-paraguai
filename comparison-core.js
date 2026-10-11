import {STATIONS,format,dateBR,calendarX,decimalYear,escapeHTML} from './dashboard-core.js';
export const stationColors=['#147f9b','#258772','#b66d2f'];
export function dailyRows(data,name,year){return ((data.stations[name]||{}).daily||[]).filter(r=>r.date.startsWith(String(year))&&Number.isFinite(r.mean)).sort((a,b)=>a.date.localeCompare(b.date));}
export function dailySummary(rows){
 const values=rows.map(r=>r.mean),n=values.length,mean=n?values.reduce((a,b)=>a+b,0)/n:null;
 return {n,mean,min:n?Math.min(...rows.map(r=>r.min)):null,max:n?Math.max(...rows.map(r=>r.max)):null,sd:n>1?Math.sqrt(values.reduce((a,v)=>a+(v-mean)**2,0)/(n-1)):null};
}
export function comparisonSeries(overview,telemetry,mode,year,visible=STATIONS){
 return STATIONS.filter(name=>visible.includes(name)).map(name=>{
  const h=overview.stations[name],color=stationColors[STATIONS.indexOf(name)];
  const rows=mode==='year'?dailyRows(telemetry,name,year).map(r=>({...r,x:calendarX(r.date),label:dateBR(r.date),key:r.date})):mode==='season'?h.profile.map(r=>({x:calendarX(r[0]),key:r[0],label:r[0].split('-').reverse().join('/'),min:r[1],max:r[2],mean:r[3],sd:r[4],n:r[5]})):h.annual.map(r=>({x:r[0]+.5,key:String(r[0]),label:String(r[0]),min:r[1],max:r[2],mean:r[3],sd:r[4],n:r[5]}));
  const supplemental=mode==='year'?(telemetry.supplement||[]).filter(r=>r.station===name&&r.date.startsWith(String(year))).map(r=>({...r,x:calendarX(r.date),mean:r.level_m,key:r.date,label:dateBR(r.date)})):[];
  const marine=mode==='year'?(telemetry.marinhaArchive||[]).filter(r=>r.station===name&&r.date.startsWith(String(year))&&Number.isFinite(r.level_m)).map(r=>({...r,x:calendarX(r.date),mean:r.level_m,key:r.date,label:dateBR(r.date)})):[];
  return {name,color,rows,supplemental,marine};
 });
}
export function comparisonGraph(series,{mode='year',width=1000,relative=false,bands=false,current=null,year=2026}={}){
 const W=Math.max(300,width),H=W<500?280:320,L=44,R=20,T=33,B=35;
 let baseline=null;
 if(relative&&series.length){const common=series[0].rows.filter(r=>series.every(s=>s.rows.some(v=>v.key===r.key)));baseline=common[0]||null;}
 const plotted=series.map(s=>{const offset=relative&&baseline?s.rows.find(r=>r.key===baseline.key).mean:0;return {...s,rows:relative&&!baseline?[]:s.rows.map(r=>({...r,mean:r.mean-offset,min:r.min-offset,max:r.max-offset})),supplemental:relative&&!baseline?[]:(s.supplemental||[]).map(r=>({...r,mean:r.mean-offset})),offset};});
 for(const s of plotted)s.marine=relative&&!baseline?[]:(s.marine||[]).map(r=>({...r,mean:r.mean-s.offset}));
 const all=plotted.flatMap(s=>s.rows),currentX=current?(mode==='history'?decimalYear(current.date):calendarX(current.date)):null;
 const x0=mode==='history'?1966:0,x1=mode==='history'?Math.max(2026,currentX?Math.ceil(currentX):2026):365;
 if(!all.length&&!plotted.some(s=>s.marine.length))return {svg:'<div class="plot-empty">'+(series.length?'Ainda não há observações verificadas neste recorte.':'Selecione uma estação para comparar.')+'</div>',rows:[],series:plotted,W,L,R,x0,x1,baseline};
 const vals=all.flatMap(r=>bands?[r.min,r.max,r.mean+(r.sd||0),r.mean-(r.sd||0)]:[r.mean]);
 plotted.forEach(s=>(s.supplemental||[]).forEach(r=>vals.push(r.mean)));
 plotted.forEach(s=>s.marine.forEach(r=>vals.push(r.mean)));
 if(current&&!relative)vals.push(current.level_m);
 const min=Math.min(...vals),max=Math.max(...vals),span=Math.max(.2,max-min),lo=Math.min(0,min)-span*.08,hi=max+span*.13;
 const X=x=>L+(x-x0)/(x1-x0)*(W-L-R),Y=y=>T+(hi-y)/(hi-lo)*(H-T-B);
 const gap=mode==='history'?1.5:1.5;
 function segments(rows){const out=[];for(const r of rows){if(!out.length||(mode==='year'?(Date.parse(r.date)-Date.parse(out[out.length-1][out[out.length-1].length-1].date))/86400000:r.x-out[out.length-1][out[out.length-1].length-1].x)>gap)out.push([]);out[out.length-1].push(r);}return out;}
 const path=(rows,key)=>rows.map((r,i)=>(i?'L':'M')+X(r.x).toFixed(2)+','+Y(typeof key==='function'?key(r):r[key]).toFixed(2)).join(' ');
 const area=(rows,lo,hi)=>path(rows,hi)+' '+[...rows].reverse().map(r=>'L'+X(r.x).toFixed(2)+','+Y(lo(r)).toFixed(2)).join(' ')+'Z';
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" class="history-svg comparison-svg" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${escapeHTML(series.map(s=>s.name).join(', '))}: ${mode==='year'?'registros de '+year:mode==='season'?'ciclo anual histórico':'médias anuais históricas'}"><title>Rio Paraguai · ${mode==='year'?year:'1966–2025'}</title><desc>Linhas interrompidas onde faltam observações. Réguas com zeros locais diferentes. ${bands?'Cinza: mínima e máxima diária; azul: média mais ou menos um desvio-padrão dos registros do dia.':''}</desc><rect width="${W}" height="${H}" fill="white"/><text x="${L}" y="16" fill="#607184" font-family="sans-serif" font-size="11">${relative?'MUDANÇA':'COTA'} · m</text>`;
 for(let i=0;i<5;i++){const v=lo+(hi-lo)*i/4;svg+=`<path d="M${L} ${Y(v)}H${W-R}" stroke="#e7eff3"/><text x="${L-9}" y="${Y(v)+4}" text-anchor="end" fill="#728090" font-family="sans-serif" font-size="11">${format(v,hi-lo<1?2:1)}</text>`;}
 const ticks=mode==='history'?(W<500?[[1966,'1966'],[1985,'1985'],[2005,'2005'],[x1,String(x1)]]:[[1966,'1966'],[1980,'1980'],[1995,'1995'],[2010,'2010'],[x1,String(x1)]]):(W<500?[[0,'Jan'],[91,'Abr'],[182,'Jul'],[274,'Out'],[365,'Dez']]:[[0,'Jan'],[60,'Mar'],[121,'Mai'],[182,'Jul'],[244,'Set'],[305,'Nov'],[365,'Dez']]);
 for(const [x,label] of ticks)svg+=`<text x="${X(x)}" y="${H-10}" text-anchor="${x===x0?'start':x===x1?'end':'middle'}" fill="#728090" font-family="sans-serif" font-size="11">${label}</text>`;
 for(const s of plotted){for(const part of segments(s.rows)){
   if(bands&&part.length>1){svg+=`<path d="${area(part,r=>r.min,r=>r.max)}" fill="#e8eef2"/><path d="${area(part,r=>r.mean-(r.sd||0),r=>r.mean+(r.sd||0))}" fill="#acd5e3" fill-opacity=".8"/>`;}
   svg+=`<path class="station-line" d="${path(part,'mean')}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
   if(part.length===1)svg+=`<circle cx="${X(part[0].x)}" cy="${Y(part[0].mean)}" r="3" fill="${s.color}"/>`;
  }
  const last=s.rows[s.rows.length-1];if(last)svg+=`<circle cx="${X(last.x)}" cy="${Y(last.mean)}" r="4" fill="${s.color}" stroke="white" stroke-width="1.5"/>`;
  for(const r of s.supplemental||[]){const x=X(r.x),y=Y(r.mean);svg+=`<path class="supplemental-marker" d="M${x} ${y-5}l5 5-5 5-5-5Z" fill="white" stroke="${s.color}" stroke-width="1.8"><title>SGB · ${dateBR(r.date)} · 07h · ${format(r.mean)} m${relative?' de mudança':''}</title></path>`;}
  for(const r of s.marine){if(current&&!relative&&current.station===s.name&&current.date===r.date)continue;svg+=`<circle class="marine-marker" cx="${X(r.x)}" cy="${Y(r.mean)}" r="4" fill="#bd5d36" stroke="white" stroke-width="1.2"><title>${escapeHTML(s.name)} · Marinha · ${dateBR(r.date)} · ${format(r.mean)} m${relative?' de mudança':''} · hora não informada</title></circle>`;}
 }
 if(current&&!relative){const mx=X(currentX),my=Y(current.level_m);svg+=`<circle class="latest-marker" cx="${mx}" cy="${my}" r="6" fill="#bd5d36" stroke="white" stroke-width="2"/><text x="${mx-9}" y="${Math.max(T+12,my-13)}" text-anchor="${mx<150?'start':'end'}" fill="#a24627" stroke="white" stroke-width="3" paint-order="stroke" font-size="11" font-family="sans-serif">Marinha · ${format(current.level_m)} m</text>`;}
 svg+=`<line class="hover-line" x1="0" x2="0" y1="${T}" y2="${H-B}" stroke="#647e8d" stroke-dasharray="3 3" visibility="hidden"/></svg>`;
 return {svg,rows:all,series:plotted,W,L,R,x0,x1,baseline};
}
export function yearCardExtras(overview,telemetry,name,current,index,width=850){
 const year=telemetry.year||2026,series=comparisonSeries(overview,telemetry,'year',year,[name]),rows=dailyRows(telemetry,name,year),s=telemetry.stations[name]||{};
 const graph=comparisonGraph(series,{mode:'year',year,width,bands:true,current:current&&current.date.startsWith(String(year))?current:null});
 return {graph,stats:dailySummary(rows),scope:rows.length+' dias com dados · '+year,caption:'ANA · média e dispersão dos registros do dia · estação '+(s.code||'—'),statsLabels:['Mín. observada','Média dos dias','Máx. observada','Desvio entre dias'],details:`<p class="telemetry-note">ANA ${escapeHTML(s.code||'')} · ${rows.length} dias observados${rows.length?', de '+dateBR(rows[0].date)+' a '+dateBR(rows[rows.length-1].date):''}. Média diária dos registros disponíveis; a quantidade e os horários podem variar. Dias ausentes ficam em branco. A leitura pontual da Marinha permanece identificada à parte.</p>`};
}
