import {STATIONS,slugs,escapeHTML,format,dateBR,timeBR,localToday} from './dashboard-core.js';
/* Shared, deterministic context for both pages. No synthetic observations. */
export function previousCalendarDate(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return null;
 const target=String(Number(day.slice(0,4))-1)+day.slice(4),d=new Date(target+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===target?target:null;
}
export function distributionPosition(value,counts){
 if(!Number.isFinite(value)||!Array.isArray(counts)||!counts.length)return null;
 let below=0,equal=0,n=0;const v=Math.round(value*1e6);
 for(const [x,count] of counts){if(!Number.isFinite(x)||!Number.isInteger(count)||count<1)return null;n+=count;const k=Math.round(x*1e6);if(k<v)below+=count;else if(k===v)equal+=count;}
 return {n,below,equal,above:n-below-equal,percentile:100*(below+equal)/n,min:Math.min(...counts.map(r=>r[0])),max:Math.max(...counts.map(r=>r[0]))};
}
export function sourceComparison(current,telemetry){
 if(!current||!Number.isFinite(current.level_m))return null;
 const rows=telemetry?.stations?.[current.station]?.daily||[];
 const ana=rows.find(r=>r.date===current.date&&Number.isFinite(r.mean)&&Number.isFinite(r.min)&&Number.isFinite(r.max));
 const last=rows.filter(r=>r.date<=current.date).sort((a,b)=>b.date.localeCompare(a.date))[0]||null;
 return {ana:ana||null,last,differenceCm:ana?Math.round((current.level_m-ana.mean)*1e8)/1e6:null};
}
export function readingContext(current,history,archive=[],telemetry=null){
 if(!current||!Number.isFinite(current.level_m)||!history)return null;
 const previousDate=previousCalendarDate(current.date);
 const archived=previousDate?archive.find(r=>r.station===current.station&&r.date===previousDate&&Number.isFinite(r.level_m)):null;
 const marine=previousDate?history.marinha?.by_date?.[previousDate]:undefined;
 const historical=previousDate?history.by_date?.[previousDate]:undefined;
 const previous=archived?{value:archived.level_m,source:'Marinha · leitura publicada',kind:'marinha'}:Number.isFinite(marine)?{value:marine,source:'Marinha · tabela histórica',kind:'marinha'}:Number.isFinite(historical)?{value:historical,source:'ANA · média diária publicada',kind:'ana'}:null;
 const pair=sourceComparison(current,telemetry),reference=pair?.ana||null;
 const season=history.calendar_values?.[current.date.slice(5)]||[];
 return {previousDate,previous,difference:previous?Math.round((current.level_m-previous.value)*1e6)/1e6:null,
  pair,reference,position:reference?distributionPosition(reference.mean,history.distribution):null,
  season:reference?distributionPosition(reference.mean,season.map(v=>[v,1])):null};
}
export function contextBlock(current,history,archive=[],telemetry=null){
 const c=readingContext(current,history,archive,telemetry);if(!c)return '<div class="reading-context">Comparação indisponível.</div>';
 const p=c.position,delta=c.difference,change=delta==null?'Sem registro nessa data':Math.abs(delta)<1e-6?'Mesmo valor':format(Math.abs(delta)*100,Number.isInteger(Math.round(Math.abs(delta)*1e6)/1e4)?0:1)+' cm '+(delta>0?'acima':'abaixo');
 const previousLabel=c.previousDate?dateBR(c.previousDate):'29/02 não existe no ano anterior';
 const rank=p?format(p.percentile,1)+'%':'—';
 return `<div class="reading-context"><div class="context-year"><span class="context-label">Mesmo dia do ano anterior</span><strong class="context-change">${delta==null?'':delta>0?'↗ ':delta<0?'↘ ':'→ '}${change}</strong><small>${previousLabel}${c.previous?' · '+format(c.previous.value,c.previous.kind==='ana'?3:2)+' m':''}</small><small>${c.previous?.kind==='marinha'?'Marinha × Marinha':c.previous?'Marinha × ANA · fontes diferentes':'Sem preencher a lacuna'}</small></div><div class="context-rank"><span class="context-label">Posição da média ANA</span><strong class="context-percent">${rank}</strong><small>${p?'das cotas históricas são menores ou iguais':'Sem dado ANA na mesma data'}</small>${p?`<div class="percentile-track" role="img" aria-label="Percentil ${format(p.percentile,1)} da média ANA na base ANA"><i style="left:${Math.min(100,Math.max(0,p.percentile))}%"></i></div><small>${format(c.reference.mean,3)} m · ${dateBR(c.reference.date)}${c.reference.partial_day?' · parcial':''}</small>`:''}<small>ANA · 1966–2025 · ${format(history.n,0)} dias</small></div></div>`;
}
export function contextDetails(current,history,archive=[],telemetry=null){
 const c=readingContext(current,history,archive,telemetry);if(!c)return '';
 const p=c.position,s=c.season;
 return `<p class="context-method">A diferença anual prioriza a Marinha nas duas datas. Quando só há ANA no ano anterior, o cartão identifica a comparação entre fontes. Não se usam dias vizinhos nem valores reconstruídos.</p>${c.previous?.kind==='marinha'?`<p class="context-method">Referência anterior: ${dateBR(c.previousDate)} · ${format(c.previous.value)} m · ${c.previous.source}. O mesmo órgão de origem não certifica, por si só, continuidade do ponto e do zero da régua.</p>`:''}${p?`<p class="context-method">O percentil usa a média ANA de ${dateBR(c.reference.date)} (${format(c.reference.mean,3)} m), comparada com as médias históricas ANA: ${format(p.below,0)} dias abaixo, ${format(p.equal,0)} iguais e ${format(p.above,0)} acima. Cálculo = 100 × (menores + iguais) ÷ total. A leitura Marinha não entra nesse cálculo.</p>`:'<p class="context-method">Sem média ANA na data da leitura Marinha, a posição histórica fica indisponível. Uma leitura antiga não é apresentada como se fosse de hoje.</p>'}${s?`<p class="context-method">Somente ${dateBR(current.date).slice(0,5)} nos anos anteriores: ${format(s.percentile,1)}% de ${s.n} valores ANA menores ou iguais.</p>`:''}<p class="context-method">O histórico longo usa médias publicadas pela ANA; a telemetria recente usa média dos registros disponíveis, que pode ser parcial. Mudanças de frequência, local e zero da régua ainda não foram homogeneizadas. São referências descritivas, não recordes oficiais ou alertas.</p>`;
}
export function summaryCards(latest,overview,archive=[],telemetry=null,today=localToday()){
 return STATIONS.map(name=>{const r=latest.stations?.find(r=>r.station===name);return `<article class="now-card"><div class="now-head"><h3>${name}</h3><span class="source-tag">Marinha</span></div><div class="now-reading"><strong>${format(r?.level_m)}<small> m</small></strong><span>${dateBR(r?.date)}${r?.date&&r.date<today?'<small>Leitura anterior a hoje</small>':''}</span></div>${contextBlock(r,overview.stations[name],archive,telemetry)}<details><summary>Ver horário e método <span>+</span></summary><p>Medição: ${dateBR(r?.date)} · ${escapeHTML(r?.measurement_time||'hora não informada pela Marinha')}.</p><p>Registro coletado em ${timeBR(r?.collected_at)}.</p>${contextDetails(r,overview.stations[name],archive,telemetry)}</details></article>`;}).join('');
}
export function sourceAuditPanel(latest,telemetry,audit){
 const cards=STATIONS.map(name=>{const current=latest.stations?.find(r=>r.station===name),pair=sourceComparison(current,telemetry),a=pair?.ana;
  const diff=pair?.differenceCm,sign=diff>0?'+':diff<0?'−':'';
  return `<article class="source-pair"><h3>${name}</h3><span class="context-label">${dateBR(current?.date)}</span><dl><div><dt>Marinha · leitura</dt><dd>${format(current?.level_m)} m</dd></div><div><dt>ANA · média${a?.partial_day?' parcial':''}</dt><dd>${a?format(a.mean,3)+' m':'Indisponível'}</dd></div></dl><b class="source-difference">${a?'Diferença: '+sign+format(Math.abs(diff),2)+' cm':'Sem par na mesma data'}</b><small>${a?'ANA: '+format(a.min)+'–'+format(a.max)+' m · '+a.n+' registros':pair?.last?'Último dia ANA disponível: '+dateBR(pair.last.date):'Aguardando registros ANA'}.</small></article>`;}).join('');
 const rows=audit?STATIONS.map(name=>{const a=audit.stations?.[name];return a?`<tr><th scope="row">${name}</th><td>${a.n}</td><td>${format(a.mean_absolute_difference_cm,2)} cm</td><td>${format(a.max_absolute_difference_cm,1)} cm</td></tr>`:'';}).join(''):'';
 return `<div class="source-audit-heading"><div><span class="eyebrow">CONFERÊNCIA ENTRE FONTES</span><h2>ANA e Marinha, lado a lado.</h2></div><span class="source-tag">Mesma data</span></div><p class="context-intro">Diferença = leitura Marinha − média ANA. A hora da leitura Marinha não é informada; médias parciais podem mudar ao longo do dia.</p><div class="source-pairs">${cards}</div><details class="health-details"><summary>O que mostrou a auditoria de 2025 <span>+</span></summary>${rows?`<div class="source-table-wrap"><table><thead><tr><th>Estação</th><th>Pares</th><th>Dif. média absoluta</th><th>Maior diferença</th></tr></thead><tbody>${rows}</tbody></table></div><p>Datas coincidentes: ano completo para Cáceres e Ladário; 01/01 a 14/10 para Porto Murtinho. Tabelas Marinha recuperadas: 1.017 registros; 1.014 têm par elegível na base ANA. Essas contagens descrevem a auditoria, não toda a disponibilidade da Marinha.</p><p>A comparação com os registros ANA das 7h reduz a diferença média absoluta para 3,28 cm, 0,09 cm e 0,48 cm, respectivamente. Isso não elimina as divergências nem certifica a equivalência das réguas. Horários e fuso da medição Marinha não foram presumidos.</p>`:'<p>Relatório de pares indisponível nesta consulta.</p>'}<p><a href="data/source-audit.csv" download>Baixar todos os pares ↓</a> · <a href="data/history-marinha.csv" download>Histórico Marinha recuperado ↓</a> · <a href="https://www.marinha.mil.br/chn-6/alturaAnterioresRios" target="_blank" rel="noopener">Acervo oficial Marinha ↗</a></p><p>Os PDFs oficiais foram lidos pela extração textual pública. A cópia binária e a conferência visual não ficaram acessíveis nesta auditoria. URLs, páginas, transcrições e verificações dos totais estão no <a href="data/source-audit.json" target="_blank" rel="noopener">registro de procedência</a>.</p></details>`;
}
export function nextScheduled(now=new Date(),times=['07:20','08:20','10:20','14:20']){
 const day=localToday(now),future=times.map(t=>new Date(day+'T'+t+':00-04:00')).filter(d=>d>now);
 if(future.length)return new Date(Math.min(...future));
 return new Date(Date.parse(day+'T'+times[0]+':00-04:00')+86400000);
}
export function marinhaFreshness(latest,today=localToday()){
 const stale=STATIONS.filter(name=>!latest.stations?.some(r=>r.station===name&&r.date===today));
 return stale.length?{stale,text:'Marinha sem leitura de hoje: '+stale.join(', ')}:{stale,text:'Marinha: leituras de hoje'};
}
export function collectionOverdue(latest,now=new Date()){
 const day=localToday(now),times=['07:20','08:20','10:20','14:20'];
 const due=times.map(t=>Date.parse(day+'T'+t+':00-04:00')).filter(t=>t<=now.getTime());
 return due.length>0&&!(Date.parse(latest.last_direct_attempt_at)>=Math.max(...due));
}
export function sourceHealth(latest,telemetry,now=new Date()){
 const direct=latest.direct_status==='unavailable'||latest.fetch_status==='error',fresh=marinhaFreshness(latest,localToday(now));
 const ana=telemetry?.status==='partial_error'?'Consulta ANA parcial':telemetry?.status==='error'?'Consulta ANA falhou':telemetry?.fetched_at?'Última consulta ANA concluída':'ANA sem consulta confirmada';
 const overdue=collectionOverdue(latest,now);
 return `<div class="health-grid"><div><span class="context-label">Marinha · última consulta bem-sucedida</span><b>${timeBR(latest.last_success_at)}</b><small>${escapeHTML(fresh.text)}</small><small>${direct?'Última consulta direta falhou · dados anteriores preservados':'Consulta direta: '+(latest.direct_status==='ok'?'concluída':'sem confirmação')}</small></div><div><span class="context-label">ANA · última coleta bem-sucedida</span><b>${timeBR(telemetry?.fetched_at)}</b><small>${ana}</small></div><div><span class="context-label">Próxima tentativa direta prevista</span><b>${timeBR(nextScheduled(now).toISOString())}</b><small>${overdue?'Tentativa prevista anterior ainda sem confirmação · pode haver atraso':'Horário de MT · pode haver atraso'}</small></div></div><details class="health-details"><summary>Coleta, horários e rastreabilidade <span>+</span></summary><p>A hora de coleta é a consulta à fonte, não a hora da medição. A Marinha publica a data, mas não a hora da leitura. Última tentativa direta: ${timeBR(latest.last_direct_attempt_at)}. Última consulta pública complementar registrada: ${timeBR(latest.last_verified_web_at)}.</p><p>Consultas diretas previstas: 07h20, 08h20, 10h20 e 14h20 (MT, UTC−4). A previsão não confirma que uma execução ocorreu. A execução da tarefa complementar deve ser conferida separadamente; não é garantida por este painel. O botão atualizar busca o último arquivo publicado, sem consultar as fontes oficiais. Em falhas, o último dado é preservado com sua data real.</p><p>O histórico foi recuperado da ANA em 11/10/2026. A base antiga apresentou divergências e está preservada somente para auditoria. <a href="https://github.com/ernandes-sobreira/cota-rio-paraguai/blob/main/AUDITORIA.md" target="_blank" rel="noopener">Ver auditoria</a> · <a href="data/history-provenance.json" target="_blank" rel="noopener">Procedência e hashes</a> · <a href="https://github.com/ernandes-sobreira/cota-rio-paraguai/actions" target="_blank" rel="noopener">Execuções da coleta ↗</a></p></details>`;
}
export function canReplaceMarinhaFeed(feed,current,today=localToday(),now=new Date()){
 if(!validMarinhaFeed(feed,today,now))return false;
 if(!validMarinhaFeed(current,today,now))return true;
 const a=Date.parse(feed.checked_at||feed.last_success_at),b=Date.parse(current.checked_at||current.last_success_at);
 return (a>b||(a===b&&Date.parse(feed.last_success_at)>Date.parse(current.last_success_at)))&&STATIONS.every(name=>feed.stations.find(s=>s.station===name).date>=current.stations.find(s=>s.station===name).date);
}
export function validMarinhaFeed(feed,today=localToday(),now=new Date()){
 if(!feed||feed.source_url!=='https://www.marinha.mil.br/chn-6/'||!Array.isArray(feed.stations)||feed.stations.length!==3||!Number.isFinite(Date.parse(feed.last_success_at)))return false;
 if(['last_success_at','checked_at','last_direct_attempt_at','last_verified_web_at'].some(key=>feed[key]!=null&&(!Number.isFinite(Date.parse(feed[key]))||Date.parse(feed[key])>now.getTime())))return false;
 return STATIONS.every(name=>feed.stations.filter(s=>s.station===name).length===1&&feed.stations.some(s=>s.station===name&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&!Number.isNaN(Date.parse(s.date+'T00:00:00Z'))&&new Date(s.date+'T00:00:00Z').toISOString().slice(0,10)===s.date&&s.date<=today&&Number.isFinite(s.level_m)&&s.level_m>=-10&&s.level_m<=30&&(s.variation_m==null||Number.isFinite(s.variation_m))));
}
