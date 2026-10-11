// Classic bundle with all initial plots already rendered in HTML.
const overview=JSON.parse(document.getElementById('overview-seed').textContent);
let latest=JSON.parse(document.getElementById('latest-seed').textContent),telemetry=JSON.parse(document.getElementById('telemetry-seed').textContent),mode='year',busy=false;
const stationRoot=document.getElementById('estacoes'),status=document.getElementById('connection-status'),refresh=document.getElementById('refresh'),visible=new Set(STATIONS);
let graphCache={},overlayGraph=null;
function validFeed(feed){return feed&&Array.isArray(feed.stations)&&Number.isFinite(Date.parse(feed.last_success_at))&&STATIONS.every(name=>feed.stations.some(s=>s.station===name&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&s.date<=localToday()&&typeof s.level_m==='number'&&s.level_m>=-10&&s.level_m<=30));}
function validTelemetry(feed){return feed&&feed.unit==='m'&&Number.isFinite(Date.parse(feed.fetched_at))&&STATIONS.every(name=>feed.stations&&feed.stations[name]&&Array.isArray(feed.stations[name].daily)&&feed.stations[name].daily.every(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&r.date<=localToday()&&Number.isFinite(r.mean)&&Number.isFinite(r.min)&&Number.isFinite(r.max)&&r.min<=r.mean&&r.mean<=r.max&&r.n>0));}
function rank(feed){return [Date.parse(feed.last_success_at)||0,Date.parse(feed.checked_at)||0];}
function newer(a,b){const x=rank(a),y=rank(b);return x[0]>y[0]||(x[0]===y[0]&&x[1]>y[1]);}
function canReplace(feed){return validFeed(feed)&&newer(feed,latest)&&STATIONS.every(name=>feed.stations.find(s=>s.station===name).date>=latest.stations.find(s=>s.station===name).date);}
function current(name){return latest.stations.find(s=>s.station===name);}
function coverageText(){return STATIONS.map(name=>{const s=telemetry.stations[name],r=dailyRows(telemetry,name,telemetry.year);return name+': '+r.length+' dias'+(r.length?' · até '+dateBR(r[r.length-1].date):'');}).join('  /  ')+'. Porto Murtinho: losangos são leituras pontuais de boletins SGB, sem ligar os dias ausentes.';}
function render(){
 const width=(stationRoot.querySelector('.plot')||{}).clientWidth||Math.min(850,Math.max(300,window.innerWidth-105));
 const open=Array.from(stationRoot.querySelectorAll('details[open]')).map(d=>d.closest('article').id);
 graphCache={};stationRoot.innerHTML=STATIONS.map((name,i)=>{
  const extra=mode==='year'?yearCardExtras(overview,telemetry,name,current(name),i,width):{};
  graphCache[slugs[i]]=extra.graph||historySVG(overview.stations[name],current(name),mode,width,name);
  return stationCard(name,overview.stations[name],current(name),i,mode,width,extra);
 }).join('');
 open.forEach(id=>{const el=document.querySelector('#'+id+' details');if(el)el.open=true;});
 document.getElementById('verified-at').textContent=timeBR(mode==='year'?telemetry.fetched_at:latest.last_success_at);
 document.querySelector('.update-label').innerHTML='<i></i> '+(mode==='year'?'Última consulta · ANA':'Última verificação · Marinha');
 document.getElementById('year-tab').textContent=telemetry.year;
 document.getElementById('mode-caption').textContent=mode==='year'?telemetry.year+' · registros ANA por dia; hoje é parcial. Losangos: leituras pontuais SGB.':mode==='history'?'Mínima, máxima, média e desvio-padrão das cotas diárias de cada ano · 1966–2025':'Distribuição de cada dia do calendário ao longo de 1966–2025';
 document.getElementById('year-coverage').textContent=coverageText();document.getElementById('year-coverage').hidden=mode!=='year';
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 document.querySelectorAll('.river-stops a').forEach((a,i)=>{const r=current(STATIONS[i]);a.querySelector('strong').textContent=format(r&&r.level_m)+' m';a.querySelector('small').textContent='Marinha · '+dateBR(r&&r.date).slice(0,5);});
 STATIONS.forEach((name,i)=>{const svg=document.querySelector('[data-chart="'+slugs[i]+'"] svg');if(svg)bindGraph(svg,graphCache[slugs[i]],document.getElementById('readout-'+slugs[i]));document.querySelector('[data-download="'+slugs[i]+'"]').onclick=()=>saveSVG(svg,name);});
 renderOverlay();applyLayout();
}
function renderOverlay(){
 const host=document.getElementById('overlay-chart'),relative=document.getElementById('comparison-metric').value==='relative',series=comparisonSeries(overview,telemetry,mode,telemetry.year,Array.from(visible));
 overlayGraph=comparisonGraph(series,{mode,year:telemetry.year,width:host.clientWidth||Math.min(1040,Math.max(300,window.innerWidth-95)),relative});
 host.innerHTML=overlayGraph.svg;const readout=document.getElementById('overlay-readout');readout.textContent=mode==='year'?'Médias dos registros de cada dia · ANA · ◇ SGB às 7h':mode==='season'?'Médias do mesmo dia do calendário · 1966–2025':'Médias anuais · 1966–2025';
 document.getElementById('overlay-note').textContent=relative?(overlayGraph.baseline?'Mudança em relação ao primeiro período comum: '+overlayGraph.baseline.label+'. Cada estação parte do seu próprio nível.':'Não há um período comum para esta comparação.'):'Cada régua tem seu próprio zero. Compare o comportamento das curvas; cotas não são altitudes.';
 const svg=host.querySelector('svg');if(svg)bindGraph(svg,overlayGraph,readout);document.getElementById('download-overlay').disabled=!svg;
}
function applyLayout(){const layout=document.getElementById('layout').value;document.getElementById('comparar').hidden=layout==='separate';stationRoot.hidden=layout==='overlay';document.getElementById('separate-heading').hidden=layout==='overlay';}
function bindGraph(svg,graph,readout){
 const series=graph.series||[{name:'',rows:graph.rows}],byX=new Map();
 series.forEach(s=>s.rows.forEach(r=>{if(!byX.has(r.x))byX.set(r.x,r);}));const rows=Array.from(byX.values()).sort((a,b)=>a.x-b.x),line=svg.querySelector('.hover-line');let selected=0;const original=readout.textContent;
 if(!rows.length||!line)return;
 function show(index){selected=Math.max(0,Math.min(rows.length-1,index));const r=rows[selected],x=graph.L+(r.x-graph.x0)/(graph.x1-graph.x0)*(graph.W-graph.L-graph.R);line.setAttribute('x1',x);line.setAttribute('x2',x);line.setAttribute('visibility','visible');
  readout.textContent=r.label+' · '+(series.length>1?series.map(s=>{const v=s.rows.find(v=>v.x===r.x);return s.name+': '+(v?format(v.mean)+' m':'sem registro ANA');}).join(' / '):'mín. '+format(r.min)+' · média '+format(r.mean)+' · máx. '+format(r.max)+' · desvio '+format(r.sd)+' m · n = '+r.n+(mode==='year'?' registros'+(r.partial_day?' · dia parcial':''):mode==='season'?' anos':' dias'));
 }
 svg.addEventListener('pointermove',e=>{const box=svg.getBoundingClientRect();if(!box.width)return;const x=graph.x0+((e.clientX-box.left)*graph.W/box.width-graph.L)/(graph.W-graph.L-graph.R)*(graph.x1-graph.x0);let best=0;rows.forEach((r,i)=>{if(Math.abs(r.x-x)<Math.abs(rows[best].x-x))best=i;});show(best);});
 const clear=()=>{line.setAttribute('visibility','hidden');readout.textContent=original;};svg.addEventListener('pointerleave',clear);svg.addEventListener('blur',clear);
 svg.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();show(selected+(e.key==='ArrowRight'?1:-1));}if(e.key==='Home'){e.preventDefault();show(0);}if(e.key==='End'){e.preventDefault();show(rows.length-1);}});
}
function saveSVG(svg,name){if(!svg)return;const clone=svg.cloneNode(true),view=clone.getAttribute('viewBox').split(' ').map(Number),height=view[3];const cursor=clone.querySelector('.hover-line');if(cursor)cursor.remove();clone.setAttribute('viewBox','0 0 '+view[2]+' '+(height+47));clone.setAttribute('width',view[2]);clone.setAttribute('height',height+47);clone.querySelector('rect').setAttribute('height',height+47);
 const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x','20');label.setAttribute('y',height+14);label.setAttribute('font-family','sans-serif');label.setAttribute('font-size','8');label.setAttribute('fill','#657786');label.textContent=name+' · Cota Rio Paraguai · '+(mode==='year'?telemetry.year+' · ANA; ◇ SGB; ponto laranja Marinha':'1966–2025 · base histórica do projeto');clone.appendChild(label);const note=label.cloneNode();note.setAttribute('y',height+29);note.textContent='Zeros locais distintos. Lacunas sem interpolação. '+(mode==='year'?'Registros provisórios.':'Continuidade do zero com a régua atual não confirmada.');clone.appendChild(note);
 saveFile('rio-paraguai-'+(name==='Três estações'?'comparacao':slugs[STATIONS.indexOf(name)])+'-'+mode+'.svg',new XMLSerializer().serializeToString(clone),'image/svg+xml;charset=utf-8');
}
function saveFile(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function fetchJSON(url,valid){const controller=typeof AbortController==='function'?new AbortController():null;let timer;try{return await Promise.race([(async()=>{const response=await fetch(url,{cache:'no-store',...(controller?{signal:controller.signal}:{})});if(!response.ok)throw Error('HTTP '+response.status);const feed=await response.json();if(!valid(feed))throw Error('Dados inválidos');return feed;})(),new Promise((_,reject)=>{timer=setTimeout(()=>{if(controller)controller.abort();reject(Error('Tempo de consulta excedido'));},7000);})]);}finally{clearTimeout(timer);}}
async function update(){if(busy||typeof fetch!=='function')return;busy=true;refresh.disabled=true;status.textContent='Consultando atualização…';try{
 const stamp=Date.now(),base='https://raw.githubusercontent.com/ernandes-sobreira/cota-rio-paraguai/main/data/';
 const [feeds,records]=await Promise.all([Promise.all(['data/latest.json',base+'latest.json'].map(url=>fetchJSON(url+'?t='+stamp,validFeed).catch(()=>null))),Promise.all(['data/telemetry-daily.json',base+'telemetry-daily.json'].map(url=>fetchJSON(url+'?t='+stamp,validTelemetry).catch(()=>null)))]);
 let changed=false;feeds.filter(Boolean).forEach(feed=>{if(canReplace(feed)){latest=feed;changed=true;}});records.filter(Boolean).forEach(feed=>{if(Date.parse(feed.fetched_at)>Date.parse(telemetry.fetched_at)&&feed.year>=telemetry.year){feed.supplement=telemetry.supplement;telemetry=feed;changed=true;}});
 if(changed){render();try{localStorage.setItem('cota-paraguai-v2-last',JSON.stringify(latest));localStorage.setItem('cota-paraguai-v2-ana',JSON.stringify(telemetry));}catch{}}
 status.textContent=records.some(Boolean)?'Dados ANA consultados'+(telemetry.status==='partial_error'?' · consulta parcial':''): 'Cópia ANA preservada · sem conexão';
 status.title='Marinha verificada em '+timeBR(latest.last_success_at)+(latest.fetch_status==='error'?'. Consulta direta indisponível; última leitura preservada.':'');
 }catch{status.textContent='Cópia preservada · sem conexão';}finally{busy=false;refresh.disabled=false;}}
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;render();});
 document.querySelectorAll('[data-series]').forEach(input=>input.onchange=()=>{input.checked?visible.add(input.value):visible.delete(input.value);renderOverlay();});
 document.getElementById('comparison-metric').onchange=renderOverlay;document.getElementById('layout').onchange=()=>{applyLayout();render();};document.getElementById('download-overlay').onclick=()=>saveSVG(document.querySelector('#overlay-chart svg'),'Três estações');
 document.getElementById('motion-toggle').onclick=()=>{const paused=document.body.classList.toggle('motion-paused'),b=document.getElementById('motion-toggle');b.setAttribute('aria-pressed',String(paused));b.textContent=paused?'Animar água ▷':'Pausar água Ⅱ';};
 if(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches){document.body.classList.add('motion-paused');document.getElementById('motion-toggle').textContent='Movimento reduzido';document.getElementById('motion-toggle').setAttribute('aria-pressed','true');}
 document.querySelector('a[href="#dados"]').onclick=()=>{document.getElementById('dados').open=true;};
 document.querySelectorAll('.river-stops a').forEach(a=>a.addEventListener('click',()=>{document.getElementById('layout').value='both';applyLayout();}));
 refresh.onclick=update;
 try{const saved=JSON.parse(localStorage.getItem('cota-paraguai-v2-last'));if(canReplace(saved))latest=saved;const savedANA=JSON.parse(localStorage.getItem('cota-paraguai-v2-ana'));if(validTelemetry(savedANA)&&Date.parse(savedANA.fetched_at)>Date.parse(telemetry.fetched_at)){savedANA.supplement=telemetry.supplement;telemetry=savedANA;}}catch{}
 render();update();let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,180);});setInterval(()=>{if(!document.hidden)update();},15*60*1000);
