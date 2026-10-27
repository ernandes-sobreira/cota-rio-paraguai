import http from 'node:http';
const PORT=Number(process.env.PORT||10000);
const HOST='0.0.0.0';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':'*'};
const server=http.createServer((req,res)=>{
  if(req.method!=='GET'){res.writeHead(405,headers);res.end(JSON.stringify({error:'method_not_allowed'}));return;}
  const path=new URL(req.url||'/', 'http://localhost').pathname;
  if(path==='/health'){
    res.writeHead(200,headers);
    res.end(JSON.stringify({service:'ana-hidroweb-relay',status:'awaiting_validation',ana_connected:false,credential_configuration:'not_reported',public_data:false}));
    return;
  }
  res.writeHead(503,headers);
  res.end(JSON.stringify({status:'integration_not_activated',message:'Integração ANA em validação; dados oficiais não publicados por este serviço.'}));
});
server.listen(PORT,HOST,()=>console.log('ANA relay listening on port '+PORT+' (no credential data in logs)'));
