// Bundled as a classic script: the initial charts are already in index.html.
const overview=JSON.parse(document.getElementById('overview-seed').textContent);
let latest=JSON.parse(document.getElementById('latest-seed').textContent),mode='history',busy=false;
const stationRoot=document.getElementById('estacoes'),status=document.getElementById('connection-status'),refresh=document.getElementById('refresh');
const captions={history:'Mínima, máxima, média e desvio-padrão das cotas diárias de cada ano · 1966–2025',season:'Mínima, máxima, média e desvio-padrão para cada dia do calendário, reunindo os anos de 1966–2025'};
function validFeed(feed){
 return feed&&Array.isArray(feed.stations)&&Number.isFinite(Date.parse(feed.last_success_at))&&STATIONS.every(name=>feed.stations.some(s=>s.station===name&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&Number.isFinite(Date.parse(s.date))&&s.date<=localToday()&&typeof s.level_m==='number'&&s.level_m>=-10&&s.level_m<=30));
}
function rank(feed){return [Date.parse(feed.last_success_at)||0,Date.parse(feed.checked_at)||0];}
function newer(a,b){const x=rank(a),y=rank(b);return x[0]>y[0]||(x[0]===y[0]&&x[1]>y[1]);}
function canReplace(feed){return validFeed(feed)&&newer(feed,latest)&&STATIONS.every(name=>feed.stations.find(s=>s.station===name).date>=latest.stations.find(s=>s.station===name).date);}
function current(name){return latest.stations.find(s=>s.station===name);}
function render(){
 const first=stationRoot.querySelector('.plot'),width=first&&first.clientWidth||Math.min(850,Math.max(300,window.innerWidth-105));
 const open=Array.from(stationRoot.querySelectorAll('details[open]')).map(d=>d.closest('article').id);
 stationRoot.innerHTML=STATIONS.map((name,i)=>stationCard(name,overview.stations[name],current(name),i,mode,width)).join('');
 open.forEach(id=>{const el=document.querySelector('#'+id+' details');if(el)el.open=true;});
 document.getElementById('verified-at').textContent=timeBR(latest.last_success_at);
 document.getElementById('mode-caption').textContent=captions[mode];
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 bindPlots();
}
function bindPlots(){
 STATIONS.forEach((name,i)=>{
  const plot=document.querySelector('[data-chart="'+slugs[i]+'"]'),svg=plot.querySelector('svg'),rows=chartRows(overview.stations[name],mode),line=svg.querySelector('.hover-line'),readout=document.getElementById('readout-'+slugs[i]);
  const W=+svg.getAttribute('viewBox').split(' ')[2],L=42,R=18,x0=mode==='season'?0:1966,x1=mode==='season'?365:Math.max(2026,current(name)?Math.ceil(decimalYear(current(name).date)):2026);
  let selected=0;const original=readout.textContent;
  function show(index){
   selected=Math.max(0,Math.min(rows.length-1,index));const r=rows[selected],x=L+(r.x-x0)/(x1-x0)*(W-L-R);
   line.setAttribute('x1',x);line.setAttribute('x2',x);line.setAttribute('visibility','visible');
   readout.textContent=r.label+' · mín. '+format(r.min)+' · média '+format(r.mean)+' · máx. '+format(r.max)+' · desvio '+format(r.sd)+' m · n = '+r.n+(mode==='history'?' dias':' anos');
  }
  svg.addEventListener('pointermove',e=>{const box=svg.getBoundingClientRect();if(!box.width)return;const x=x0+((e.clientX-box.left)*W/box.width-L)/(W-L-R)*(x1-x0);let best=0;rows.forEach((r,j)=>{if(Math.abs(r.x-x)<Math.abs(rows[best].x-x))best=j;});show(best);});
  const clear=()=>{line.setAttribute('visibility','hidden');readout.textContent=original;};
  svg.addEventListener('pointerleave',clear);svg.addEventListener('blur',clear);
  svg.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();show(selected+(e.key==='ArrowRight'?1:-1));}if(e.key==='Home'){e.preventDefault();show(0);}if(e.key==='End'){e.preventDefault();show(rows.length-1);}});
  document.querySelector('[data-download="'+slugs[i]+'"]').addEventListener('click',()=>download(svg,name));
 });
}
function download(svg,name){
 const clone=svg.cloneNode(true),view=clone.getAttribute('viewBox').split(' ').map(Number),height=view[3];
 clone.querySelector('.hover-line').remove();clone.setAttribute('viewBox','0 0 '+view[2]+' '+(height+47));clone.setAttribute('width',view[2]);clone.setAttribute('height',height+47);clone.querySelector('rect').setAttribute('height',height+47);
 const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x','42');label.setAttribute('y',height+14);label.setAttribute('font-family','sans-serif');label.setAttribute('font-size','9');label.setAttribute('fill','#657786');label.textContent=name+' · Cota Rio Paraguai · referência 1966–2025 · leitura '+dateBR(current(name).date);clone.appendChild(label);
 const note=label.cloneNode();note.setAttribute('y',height+29);note.textContent='Fonte atual: Marinha do Brasil. Continuidade do zero/local com o histórico não confirmada.';clone.appendChild(note);
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='rio-paraguai-'+slugs[STATIONS.indexOf(name)]+'-'+mode+'.svg';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function fetchFeed(url){
 const controller=typeof AbortController==='function'?new AbortController():null;let timer;
 try{return await Promise.race([(async()=>{const response=await fetch(url,{cache:'no-store',...(controller?{signal:controller.signal}:{})});if(!response.ok)throw Error('HTTP '+response.status);const feed=await response.json();if(!validFeed(feed))throw Error('Dados incompletos');return feed;})(),new Promise((_,reject)=>{timer=setTimeout(()=>{if(controller)controller.abort();reject(Error('Tempo de consulta excedido'));},7000);})]);}finally{clearTimeout(timer);}
}
function showStatus(online){
 const dates=latest.stations.map(s=>s.date),today=localToday(),allToday=dates.every(d=>d===today);
 status.textContent=online?(allToday?'Leituras de hoje':'Aguardando leitura mais recente'):'Cópia preservada · sem conexão';
 if(online&&latest.fetch_status==='error')status.textContent+=' · coleta direta indisponível';
 status.title=latest.fetch_status==='error'?'A última consulta direta à Marinha falhou. A página preserva as leituras verificadas na data indicada.':'Leituras publicadas pela Marinha; verificação não é o horário da medição.';
}
async function update(){
 if(busy||typeof fetch!=='function')return;busy=true;refresh.disabled=true;status.textContent='Consultando atualização…';
 try{
  const stamp=Date.now(),feeds=await Promise.all(['data/latest.json?t='+stamp,'https://raw.githubusercontent.com/ernandes-sobreira/cota-rio-paraguai/main/data/latest.json?t='+stamp].map(url=>fetchFeed(url).catch(()=>null)));
  let changed=false;feeds.filter(Boolean).forEach(feed=>{if(canReplace(feed)){latest=feed;changed=true;}});
  if(changed){render();try{localStorage.setItem('cota-paraguai-v2-last',JSON.stringify(latest));}catch{}}
  showStatus(feeds.some(Boolean));
 }catch{showStatus(false);}finally{busy=false;refresh.disabled=false;}
}
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;render();}));
refresh.addEventListener('click',update);
try{const saved=JSON.parse(localStorage.getItem('cota-paraguai-v2-last'));if(canReplace(saved))latest=saved;}catch{}
render();showStatus(false);update();
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,180);});
setInterval(()=>{if(!document.hidden)update();},15*60*1000);
