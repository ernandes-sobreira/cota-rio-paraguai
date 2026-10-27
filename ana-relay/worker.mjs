/**
 * Intermediário ANA em Cloudflare Workers: somente cache público de leituras
 * oficiais aprovadas. Não expõe credenciais nem faz proxy de rotas arbitrárias.
 * Configure ANA_IDENTIFICADOR e ANA_SENHA como Secrets no Worker.
 * Execute o cron somente após validar retorno real, direitos de uso e limites ANA.
 */
const BASE='https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas';
const STATIONS=Object.freeze({caceres:'66070004',ladario:'66825000',porto_murtinho:'67100000'});
const ACCESS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=900','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*'};
function output(payload,status=200){return new Response(JSON.stringify(payload),{status,headers:ACCESS});}
async function ana(url,headers){
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),15000);
  try{
    const res=await fetch(url,{method:'GET',headers,signal:ctrl.signal,redirect:'manual'});
    if(!res.ok)throw new Error('ANA HTTP '+res.status);
    const data=await res.json();
    if(data?.code && Number(data.code)>=400)throw new Error('ANA API '+data.code);
    return data;
  }finally{clearTimeout(timer);}
}
async function refresh(env){
  if(!env.ANA_IDENTIFICADOR||!env.ANA_SENHA||!env.ANA_CACHE)throw new Error('Configuração incompleta');
  const auth=await ana(BASE+'/OAUth/v1',{Identificador:env.ANA_IDENTIFICADOR,Senha:env.ANA_SENHA,Accept:'*/*'});
  const token=auth?.items?.tokenautenticacao||auth?.items?.tokenAutenticacao||auth?.tokenautenticacao;
  if(typeof token!=='string'||!token)throw new Error('Token ausente');
  const results={schema_version:1,source:'ANA HidroWebService',checked_at:new Date().toISOString(),stations:{}};
  for(const [name,code] of Object.entries(STATIONS)){
    const q=new URLSearchParams({'CodigoDaEstacao':code,'TipoFiltroData':'DATA_LEITURA','RangeIntervaloDeBusca':'DIAS_30'});
    const response=await ana(BASE+'/HidroinfoanaSerieTelemetricaAdotada/v1?'+q,{Authorization:'Bearer '+token,Accept:'*/*'});
    // Quarentena: não publicar dados cujo esquema e unidade ainda não tenham sido
    // verificados. Somente metadados genéricos são gravados neste estágio.
    results.stations[name]={code,records_returned:Array.isArray(response?.items)?response.items.length:0,validated:false};
  }
  await env.ANA_CACHE.put('diagnostic',JSON.stringify(results),{expirationTtl:86400});
}
export default {
  async fetch(request,env){
    const u=new URL(request.url);
    if(request.method!=='GET'||u.pathname!=='/health')return output({error:'not_found'},404);
    const raw=await env.ANA_CACHE?.get('diagnostic');
    return output({service:'ana-relay',configured:!!(env.ANA_IDENTIFICADOR&&env.ANA_SENHA),diagnostic:raw?JSON.parse(raw):null});
  },
  async scheduled(_event,env,ctx){
    ctx.waitUntil(refresh(env).catch(()=>{ /* preservar cache: sem logs de credenciais */ }));
  }
};
