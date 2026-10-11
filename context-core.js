/* Shared, deterministic context for both pages. No synthetic observations. */
import {STATIONS,slugs,escapeHTML,format,dateBR,timeBR,localToday} from './dashboard-core.js';
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
export function readingContext(current,history,archive=[]){
 if(!current||!Number.isFinite(current.level_m)||!history)return null;
 const previousDate=previousCalendarDate(current.date);
 const archived=previousDate?archive.find(r=>r.station===current.station&&r.date===previousDate&&Number.isFinite(r.level_m)):null;
 const historical=previousDate&&history.by_date?history.by_date[previousDate]:undefined;
 const previous=archived?{value:archived.level_m,source:'Marinha · leitura pontual'}:Number.isFinite(historical)?{value:historical,source:'ANA · média diária publicada'}:null;
 const season=history.calendar_values?.[current.date.slice(5)]||[];
 return {previousDate,previous,difference:previous?Math.round((current.level_m-previous.value)*1e6)/1e6:null,position:distributionPosition(current.level_m,history.distribution),season:distributionPosition(current.level_m,season.map(v=>[v,1]))};
}
export function contextBlock(current,history,archive=[]){
 const c=readingContext(current,history,archive);if(!c)return '<div class="reading-context">Comparação indisponível.</div>';
 const p=c.position,delta=c.difference,change=delta==null?'Sem registro nessa data':Math.abs(delta)<1e-6?'Mesmo valor':format(Math.abs(delta)*100,Number.isInteger(Math.abs(delta)*100)?0:1)+' cm '+(delta>0?'acima':'abaixo');
 const previousLabel=c.previousDate?dateBR(c.previousDate):'29/02 não existe no ano anterior';
 const rank=p?format(p.percentile,1)+'%':'—';
 return `<div class="reading-context"><div class="context-year"><span class="context-label">Mesmo dia do ano anterior</span><strong class="context-change">${delta==null?'':delta>0?'↗ ':delta<0?'↘ ':'→ '}${change}</strong><small>${previousLabel}${c.previous?' · '+format(c.previous.value)+' m':''}</small><small>${c.previous?c.previous.source:'Sem preencher a lacuna'}</small></div><div class="context-rank"><span class="context-label">Na base histórica completa</span><strong class="context-percent">${rank}</strong><small>das cotas são menores ou iguais a esta</small><div class="percentile-track" role="img" aria-label="Percentil ${p?format(p.percentile,1):'indisponível'} na base ANA"><i style="left:${p?Math.min(100,Math.max(0,p.percentile)):0}%"></i></div><div class="context-scale"><span>Mais baixas</span><span>Mais altas</span></div><small>ANA · 1966–2025 · ${p?format(p.n,0):'—'} dias</small></div></div>`;
}
export function contextDetails(current,history,archive=[]){
 const c=readingContext(current,history,archive);if(!c||!c.position)return '';
 const p=c.position,s=c.season;
 return `<p class="context-method">Posição numérica: ${format(p.below,0)} dias abaixo, ${format(p.equal,0)} iguais e ${format(p.above,0)} acima desta cota. Percentil empírico = 100 × (menores + iguais) ÷ total. Extremos da base: ${format(p.min)} a ${format(p.max)} m.</p>${s?`<p class="context-method">Somente ${dateBR(current.date).slice(0,5)} nos anos anteriores: ${format(s.below+s.equal,0)} de ${s.n} anos com cotas menores ou iguais (${format(s.percentile,1)}%).</p>`:''}<p class="context-method">A leitura pontual da Marinha é comparada numericamente com médias diárias ANA. Esta referência não confirma a mesma hora, o mesmo ponto ou a continuidade do zero da régua. O histórico não inclui 2026; ANA recente e Marinha permanecem separados. Não é recorde oficial nem alerta de seca ou cheia.</p>`;
}
export function summaryCards(latest,overview,archive=[]){
 return STATIONS.map((name,i)=>{const r=latest.stations?.find(r=>r.station===name);return `<article class="now-card"><div class="now-head"><h3>${name}</h3><span class="source-tag">Marinha</span></div><div class="now-reading"><strong>${format(r?.level_m)}<small> m</small></strong><span>${dateBR(r?.date)}</span></div>${contextBlock(r,overview.stations[name],archive)}<details><summary>Ver horário e método <span>+</span></summary><p>Medição: ${dateBR(r?.date)} · ${escapeHTML(r?.measurement_time||'hora não informada pela Marinha')}.</p><p>Registro coletado em ${timeBR(r?.collected_at)}.</p>${contextDetails(r,overview.stations[name],archive)}</details></article>`;}).join('');
}
export function nextScheduled(now=new Date(),times=['07:20','08:20','10:20','14:20']){
 const day=localToday(now),future=times.map(t=>new Date(day+'T'+t+':00-04:00')).filter(d=>d>now);
 if(future.length)return new Date(Math.min(...future));
 return new Date(Date.parse(day+'T'+times[0]+':00-04:00')+86400000);
}
export function sourceHealth(latest,telemetry){
 const direct=latest.direct_status==='unavailable'||latest.fetch_status==='error';
 const ana=telemetry?.status==='partial_error'?'Consulta ANA parcial':telemetry?.status==='error'?'Consulta ANA falhou':telemetry?.fetched_at?'Última consulta ANA concluída':'ANA sem consulta confirmada';
 return `<div class="health-grid"><div><span class="context-label">Marinha · última verificação</span><b>${timeBR(latest.last_success_at)}</b><small>${direct?'Consulta direta indisponível · leitura pública complementar':'Página oficial consultada'}</small></div><div><span class="context-label">ANA · última coleta bem-sucedida</span><b>${timeBR(telemetry?.fetched_at)}</b><small>${ana}</small></div><div><span class="context-label">Próxima tentativa direta prevista</span><b>${timeBR(nextScheduled().toISOString())}</b><small>Horário de MT · pode haver atraso</small></div></div><details class="health-details"><summary>Coleta, horários e rastreabilidade <span>+</span></summary><p>A hora de coleta é a consulta à fonte, não a hora da medição. A Marinha publica a data, mas não a hora da leitura. Última tentativa direta: ${timeBR(latest.last_direct_attempt_at||latest.checked_at)}.</p><p>Consultas diárias: 07h20, 08h20, 10h20 e 14h20 (MT, UTC−4). Complemento público agendado às 08h e 14h, sujeito à disponibilidade. O botão atualizar busca o último arquivo publicado. Em falhas, o último dado é preservado com sua data real.</p><p>O histórico foi recuperado da ANA em 11/10/2026. A base antiga apresentou divergências e está preservada somente para auditoria. <a href="https://github.com/ernandes-sobreira/cota-rio-paraguai/blob/main/AUDITORIA.md" target="_blank" rel="noopener">Ver auditoria</a> · <a href="data/history-provenance.json" target="_blank" rel="noopener">Procedência e hashes</a> · <a href="https://github.com/ernandes-sobreira/cota-rio-paraguai/actions" target="_blank" rel="noopener">Execuções da coleta ↗</a></p></details>`;
}
export function validMarinhaFeed(feed,today=localToday()){
 if(!feed||feed.source_url!=='https://www.marinha.mil.br/chn-6/'||!Array.isArray(feed.stations)||feed.stations.length!==3||!Number.isFinite(Date.parse(feed.last_success_at)))return false;
 return STATIONS.every(name=>feed.stations.filter(s=>s.station===name).length===1&&feed.stations.some(s=>s.station===name&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&!Number.isNaN(Date.parse(s.date+'T00:00:00Z'))&&new Date(s.date+'T00:00:00Z').toISOString().slice(0,10)===s.date&&s.date<=today&&Number.isFinite(s.level_m)&&s.level_m>=-10&&s.level_m<=30&&(s.variation_m==null||Number.isFinite(s.variation_m))));
}
