import http from 'node:http';
const PORT=Number(process.env.PORT||10000);
let diagnostic='pending';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const send=(res,status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
async function checkOnce(){
  const id=process.env.ANA_IDENTIFICADOR||'';
  const senha=process.env.ANA_SENHA||'';
  if(!id||!senha){diagnostic='missing_configuration';console.log('ANA_DIAGNOSTIC missing_configuration');return;}
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try {
    const r=await fetch('https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/OAUth/v1',{
      headers:{Identificador:id,Senha:senha,Accept:'*/*'},
      method:'GET',signal:controller.signal,redirect:'error'
    });
    if(!r.ok){diagnostic='http_'+r.status;console.log('ANA_DIAGNOSTIC '+diagnostic);return;}
    const body=await r.json();
    const token=body?.items?.tokenautenticacao||body?.items?.tokenAutenticacao||body?.tokenautenticacao;
    diagnostic=(body?.code===200 && token)?'auth_success':'response_needs_mapping';
    console.log('ANA_DIAGNOSTIC '+diagnostic);
  } catch(e) {
    diagnostic=e?.name==='AbortError'?'timeout':'network_error';
    console.log('ANA_DIAGNOSTIC '+diagnostic);
  } finally {clearTimeout(timeout);}
}
const server=http.createServer((req,res)=>{
  const path=new URL(req.url||'/', 'http://localhost').pathname;
  if(req.method==='GET'&&path==='/health')return send(res,200,{service:'ana-hidroweb-relay',status:'diagnostic_only',ana_connected:diagnostic==='auth_success',diagnostic,public_data:false});
  return send(res,503,{status:'integration_not_activated'});
});
server.listen(PORT,'0.0.0.0',()=>{console.log('ANA relay listening');console.log('ANA automatic authentication disabled pending provider clarification');});
