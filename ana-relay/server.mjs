import http from 'node:http';
import { openSync, closeSync } from 'node:fs';
import dc from 'node:diagnostics_channel';
import { createHash } from 'node:crypto';
const PORT=Number(process.env.PORT||10000);
const ENDPOINT='https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/OAUth/v1';
const RUN='ana-support-20261105-once';
const TRIGGER_HASH='93523027fb0964f8b39f898b60e07f3ab7944872b0210a6c77a223c257381139';
let attempted=false;
const EXPIRES=Date.parse('2026-11-05T15:25:00Z');
let diagnostic='pending';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const send=(res,status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
function sanitizer(id,senha){
  const secretKeys=/(token|senha|password|secret|credential|identificador|cpf|authorization|cookie|session|api.?key)/i;
  const safeTextKeys=/^(status|error|message|mensagem|detail|details|title|description|descricao|path|timestamp|date|time|exception)$/i;
  const clean=(s)=>{
    let out=String(s);
    for(const v of [id,senha,id.trim(),senha.trim()])if(v)out=out.split(v).join('[REDACTED]');
    return out.replace(/\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/g,'[REDACTED_IDENTIFIER]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g,'[REDACTED_TOKEN]')
      .replace(/\b[A-Za-z0-9_+/=-]{40,}\b/g,'[REDACTED_OPAQUE_VALUE]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,'[REDACTED_UUID]')
      .replace(/(Bearer\s+)[^\s"'<>]+/gi,'$1[REDACTED]')
      .replace(/((?:token|password|senha|secret|authorization|cookie)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]')
      .slice(0,4096);
  };
  const body=(v,key='',depth=0)=>{
    if(depth>12)return '[REDACTED_DEPTH_LIMIT]';
    if(secretKeys.test(key))return '[REDACTED]';
    if(v===null||typeof v==='boolean')return v;
    if(typeof v==='number'){
      const matchesSecret=[id,senha].some(x=>/^\d+$/.test(x)&&Number(x)===v);
      return !matchesSecret&&/^(code|status|statusCode|errorCode)$/i.test(key)&&Math.abs(v)<10000?v:'[REDACTED_NUMBER]';
    }
    if(typeof v==='string'){
      const cleaned=clean(v);
      const known=/^(unauthorized|forbidden|bad request|internal server error|bad credentials|access denied|authentication failed|invalid credentials|credenciais inválidas|não autorizado|nao autorizado|usuário ou senha inválidos|usuário e\/ou senha inválidos|identificador ou senha inválidos|usuário não autorizado|erro de autenticação|senha inválida|sucesso|ok|false|true)$/i;
      if(safeTextKeys.test(key)&&known.test(cleaned))return cleaned;
      if(/^(timestamp|date|time)$/i.test(key)&&/^\d{4}-\d{2}-\d{2}[T ][\d:.+-]+Z?$/.test(cleaned))return cleaned;
      if(key==='path'&&cleaned==='/hidrowebservice/EstacoesTelemetricas/OAUth/v1')return cleaned;
      return '[REDACTED_STRING]';
    }
    if(Array.isArray(v))return v.slice(0,100).map(x=>body(x,key,depth+1));
    if(typeof v==='object')return Object.fromEntries(Object.entries(v).slice(0,100).map(([k,x])=>[clean(k),body(x,k,depth+1)]));
    return '[REDACTED]';
  };
  const safeHeader=/^(accept|accept-encoding|accept-language|cache-control|connection|content-type|content-length|content-encoding|content-language|date|expires|pragma|server|vary|via|www-authenticate|x-content-type-options|x-frame-options|strict-transport-security|transfer-encoding|host|user-agent|sec-fetch-mode|access-control-allow-origin|access-control-allow-methods|access-control-allow-headers)$/i;
  const header=(k,v)=>secretKeys.test(k)?'[REDACTED]':safeHeader.test(k)?clean(v):'[REDACTED_HEADER_VALUE]';
  return {clean,body,header};
}
async function checkOnce(){
  if(attempted||Date.now()>EXPIRES)return;
  attempted=true;
  try {closeSync(openSync('/tmp/'+RUN+'.lock','wx'));}catch{diagnostic='diagnostic_already_attempted';return;}
  const id=process.env.ANA_IDENTIFICADOR||'';
  const senha=process.env.ANA_SENHA||'';
  if(!id||!senha){diagnostic='missing_configuration';console.log('ANA_SUPPORT_DIAGNOSTIC '+JSON.stringify({run:RUN,result:diagnostic}));return;}
  const s=sanitizer(id,senha);
  const report={run:RUN,started_at:new Date().toISOString(),runtime:process.version,method:'GET',url:ENDPOINT,request_body:null,timeout_ms:15000,redirect:'error',normalization:'none; values read from existing Render environment',request_headers:{Identificador:'[REDACTED]',Senha:'[REDACTED]',Accept:'*/*'}};
  const channel=dc.channel('undici:client:sendHeaders');
  const capture=({request,headers:wire})=>{
    if(request?.path!=='/hidrowebservice/EstacoesTelemetricas/OAUth/v1'||typeof wire!=='string')return;
    report.wire_request_headers=wire.split('\r\n').filter(line=>line.includes(':')).map(line=>{
      const p=line.indexOf(':');const k=line.slice(0,p);return [s.clean(k),s.header(k,line.slice(p+1).trim())];
    });
  };
  channel.subscribe(capture);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try {
    const r=await fetch(ENDPOINT,{headers:{Identificador:id,Senha:senha,Accept:'*/*'},method:'GET',signal:controller.signal,redirect:'error'});
    report.http_status=r.status;
    report.status_text=s.clean(r.statusText);
    report.response_headers=Object.fromEntries([...r.headers].map(([k,v])=>[s.clean(k),s.header(k,v)]));
    const text=await r.text();
    report.body_bytes=Buffer.byteLength(text);
    if(text.length>65536){report.body='[OMITTED_OVERSIZE_BODY]';report.body_format='not_parsed';}
    else if(!text){report.body='';report.body_format='empty';}
    else {try{report.body=s.body(JSON.parse(text));report.body_format='json_sanitized';report.body_policy='Preserve structure, HTTP-like codes, booleans, nulls, timestamps and known diagnostic phrases; redact credentials, tokens, unknown strings and numbers';}catch{report.body='[OMITTED_NON_JSON_BODY_FOR_SECRET_SAFETY]';report.body_format='non_json';}}
    diagnostic='http_'+r.status;
    report.result=diagnostic;
  } catch(e){diagnostic=e?.name==='AbortError'?'timeout':'network_error';report.result=diagnostic;}
  finally{
    clearTimeout(timeout);channel.unsubscribe(capture);
    report.finished_at=new Date().toISOString();
    console.log('ANA_SUPPORT_DIAGNOSTIC '+JSON.stringify(report));
  }
}
const server=http.createServer((req,res)=>{
  const path=new URL(req.url||'/', 'http://localhost').pathname;
  if(req.method==='POST'&&path==='/__support_diagnostic_once'){
    const supplied=(req.headers.authorization||'').replace(/^Bearer /,'');
    const valid=createHash('sha256').update(supplied).digest('hex')===TRIGGER_HASH;
    if(!valid||Date.now()>EXPIRES)return send(res,404,{status:'not_found'});
    if(attempted)return send(res,409,{status:'already_attempted'});
    void checkOnce();return send(res,202,{status:'diagnostic_started'});
  }
  if(req.method==='GET'&&path==='/health')return send(res,200,{service:'ana-hidroweb-relay',status:'diagnostic_only',ana_connected:false,diagnostic,public_data:false});
  return send(res,503,{status:'integration_not_activated'});
});
server.listen(PORT,'0.0.0.0',()=>{console.log('ANA relay listening');console.log('ANA temporary diagnostic awaiting one authorized trigger; no automatic authentication');});
