import test from 'node:test';
import assert from 'node:assert/strict';
import { run, seriesUrl, requestJson, safeErrorBody, TIMEOUT_MS, runBatch, openSession, SESSION_TTL_MS, inventoryUrl } from '../scripts/ana_hidrowebservice.mjs';
const env = {ANA_IDENTIFICADOR:'123.456.789-00', ANA_SENHA:' secret-exact '};
const token = 'test-private-token-value';
const response = (body, status=200, headers={}) => new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json',...headers}});
const successAuth = () => response({code:200,items:{tokenautenticacao:token}});

test('series uses the exact official OpenAPI names and valid range', () => {
  const u = new URL(seriesUrl('66070004', '2026-11-07'));
  assert.equal(u.pathname, '/hidrowebservice/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v1');
  assert.deepEqual(Object.fromEntries(u.searchParams), {'Código da Estação':'66070004','Tipo Filtro Data':'DATA_LEITURA','Data de Busca (yyyy-MM-dd)':'2026-11-07','Range Intervalo de busca':'DIAS_7'});
  assert.equal(TIMEOUT_MS, 90000);
});
test('mock end-to-end preserves password and token internally, prints only safe results', async () => {
  const calls=[], logs=[];
  const result = await run({env,emit:x=>logs.push(x),date:'2026-11-07',fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return calls.length===1 ? successAuth() : response({code:200,items:[{Data_Hora_Medicao:'2026-11-07 07:00:00.0', Cota_Adotada:'133.0'}]});
  }});
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.headers.Senha,env.ANA_SENHA);
  assert.equal(calls[0].options.headers.Identificador,'12345678900');
  assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[1].options.headers.Authorization,'Bearer '+token);
  assert.equal(result.records_returned,1);
  assert.deepEqual(result.latest_measurement,{measured_at:'2026-11-07 07:00:00',level_cm:133,Cota_Adotada_Status:null});
  for(const secret of [token,env.ANA_SENHA,'12345678900',env.ANA_IDENTIFICADOR]) assert.ok(!JSON.stringify(logs).includes(secret));
  assert.equal(result.public_data_changed,false);
});
test('HTTP401 captures sanitized response but never attempts series', async () => {
  let calls=0;const logs=[];
  await assert.rejects(run({env,emit:x=>logs.push(x),fetchImpl:async()=>{
    calls++;return response({code:401,message:'Rejected '+env.ANA_SENHA+' for '+env.ANA_IDENTIFICADOR,items:{tokenautenticacao:token},token,password:env.ANA_SENHA},401,{'set-cookie':'private-cookie','authorization':'Bearer '+token,'date':'Sat, 07 Nov 2026 12:00:00 GMT'});
  }}),{kind:'http_error'});
  assert.equal(calls,1);
  const log=logs.find(x=>x.http_status===401);
  assert.equal(log.body.code,401);
  assert.ok(log.headers.date);
  const serialized=JSON.stringify(logs);
  for(const secret of [token,'private-cookie',env.ANA_SENHA,env.ANA_IDENTIFICADOR]) assert.ok(!serialized.includes(secret));
});
test('API failure inside HTTP200 stops before series', async () => {
  let calls=0;
  await assert.rejects(run({env,emit:()=>{},fetchImpl:async()=>{calls++;return response({code:401,message:'Não autorizado'});}}),{kind:'api_error'});
  assert.equal(calls,1);
});
test('success without token is not authentication success', async () => {
  let calls=0;
  await assert.rejects(run({env,emit:()=>{},fetchImpl:async()=>{calls++;return response({code:200,items:{other:'unknown'}});}}),{kind:'missing_or_invalid_token'});
  assert.equal(calls,1);
});
test('nonJSON failures are sanitized; no raw exception is emitted', async () => {
  const logs=[];
  await assert.rejects(run({env,emit:x=>logs.push(x),fetchImpl:async()=>new Response('<html>Senha='+env.ANA_SENHA+' token=privateOpaqueToken</html>',{status:502})}),{kind:'http_error'});
  assert.ok(!JSON.stringify(logs).includes(env.ANA_SENHA));
  assert.ok(!JSON.stringify(logs).includes('privateOpaqueToken'));
});
test('timeout is bounded and has no retry', async () => {
  let calls=0;const logs=[];
  await assert.rejects(run({env,timeoutMs:5,emit:x=>logs.push(x),fetchImpl:async(url,{signal})=>{
    calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Never emit secret detail '+token)),{once:true}));
  }}),{kind:'timeout'});
  assert.equal(calls,1);
  assert.ok(logs.some(x=>x.outcome==='timeout'));
  assert.ok(!JSON.stringify(logs).includes(token));
});
test('HTTP413 records status and sanitized body', async () => {
  const logs=[];
  await assert.rejects(requestJson('https://example.invalid',{},'authentication',{emit:x=>logs.push(x),fetchImpl:async()=>response({code:413,message:'too large'},413)}),{kind:'http_error'});
  assert.equal(logs[0].http_status,413);
});
test('oversized bodies are cancelled without logging any partial contents', async () => {
  const logs=[];
  await assert.rejects(requestJson('https://example.invalid',{},'authentication',{maxBytes:5,emit:x=>logs.push(x),fetchImpl:async()=>new Response('secret body bigger than limit')}),{kind:'response_too_large'});
  assert.equal(logs[0].outcome,'response_too_large');
  assert.ok(!JSON.stringify(logs).includes('secret body'));
});
test('linebreak credentials are rejected before making any request', async () => {
  let calls=0;
  await assert.rejects(run({env:{...env,ANA_SENHA:'bad\nsecret'},emit:()=>{},fetchImpl:async()=>{calls++;}}),{kind:'invalid_configuration'});
  assert.equal(calls,0);
});
test('error JSON keeps only safe error fields and removes known escaped secrets', () => {
  const secret='quote"\\private';
  const result=safeErrorBody(JSON.stringify({message:'problem '+secret,items:{anything:token},custom:token}),[secret]);
  assert.deepEqual(result,{format:'json',message:'[value omitted]'});
});
test('missing levels are not converted into real zero', async () => {
  let calls=0;
  const result=await run({env,emit:()=>{},fetchImpl:async()=>++calls===1?successAuth():response({code:200,items:[
    {Data_Hora_Medicao:'2026-11-07 07:00:00',Cota_Adotada:0},
    {Data_Hora_Medicao:'2026-11-07 08:00:00',Cota_Adotada:null},
    {Data_Hora_Medicao:'2026-11-07 09:00:00',Cota_Adotada:''}
  ]})});
  assert.equal(result.valid_level_records,1);
  assert.equal(result.latest_measurement.level_cm,0);
  assert.equal(result.latest_measurement.measured_at,'2026-11-07 07:00:00');
});
test('HTTP200 nonJSON is not accepted as authentication', async () => {
  await assert.rejects(run({env,emit:()=>{},fetchImpl:async()=>new Response('<html>upstream failed</html>')}),{kind:'non_json_response'});
});
test('series without items array is not silently treated as empty success', async () => {
  let calls=0;
  await assert.rejects(run({env,emit:()=>{},fetchImpl:async()=>++calls===1?successAuth():response({code:200})}),{kind:'unexpected_records_shape'});
});
test('unknown tokens and numeric identifiers are not included in error bodies', () => {
  assert.ok(!JSON.stringify(safeErrorBody('Access token is shortTestSecret')).includes('shortTestSecret'));
  assert.ok(!JSON.stringify(safeErrorBody('{"message":12345678900,"code":12345678900}')).includes('12345678900'));
});
test('short password cannot break structured JSON logging', async () => {
  let calls=0;const logs=[];
  await run({env:{...env,ANA_SENHA:'90'},emit:x=>logs.push(x),fetchImpl:async()=>++calls===1?successAuth():response({code:200,items:[]})});
  assert.equal(calls,2);
  assert.equal(logs[0].timeout_ms,90000);
});
test('empty series is explicitly not ready for mapping', async () => {
  let calls=0;
  const result=await run({env,emit:()=>{},fetchImpl:async()=>++calls===1?successAuth():response({code:200,items:[]})});
  assert.equal(result.outcome,'empty_result');assert.equal(result.ready_for_mapping,false);
});
test('other stations are excluded rather than reported as requested station', async () => {
  let calls=0;
  const result=await run({env,emit:()=>{},fetchImpl:async()=>++calls===1?successAuth():response({code:200,items:[{codigoestacao:'12345678',Data_Hora_Medicao:'2026-11-07 07:00:00',Cota_Adotada:133}]})});
  assert.equal(result.outcome,'no_valid_measurements');assert.equal(result.mismatched_station_records,1);assert.equal(result.latest_measurement,null);
});
test('HTML errors expose only fixed markers and exact allowed titles', () => {
  const raw='<html><head><title>503 Service Temporarily Unavailable</title></head><body>Service Temporarily Unavailable privateShortToken</body></html>';
  const result=safeErrorBody(raw);
  assert.deepEqual(result.html_markers,['service_unavailable']);
  assert.equal(result.title,'503 Service Temporarily Unavailable');
  assert.equal(result.text_omitted,true);
  assert.equal(result.bytes,Buffer.byteLength(raw));
  assert.ok(!JSON.stringify(result).includes('privateShortToken'));
});
test('nonallowlisted HTML title is omitted, even with an allowed prefix', () => {
  const result=safeErrorBody('<html><title>Access Denied: shortPrivateToken</title><body>Request Rejected</body></html>');
  assert.equal(result.title,undefined);
  assert.deepEqual(result.html_markers,['access_denied','request_rejected']);
  assert.ok(!JSON.stringify(result).includes('shortPrivateToken'));
});
test('bot classification needs strong explicit HTML markers, not a bare403 or denial', () => {
  const denied=safeErrorBody('<html><title>Access Denied</title><body>403 Forbidden</body></html>');
  assert.deepEqual(denied.html_markers,['access_denied']);
  assert.equal(denied.title,'Access Denied');
  const challenged=safeErrorBody('<html><title>Checking your browser</title><body>Verify you are human</body></html>');
  assert.deepEqual(challenged.html_markers,['bot_or_security_challenge']);
  assert.equal(challenged.title,undefined);
  assert.equal(safeErrorBody('403 Forbidden').html_markers,undefined);
});
test('server headers expose only exact allowlist values, not versions or secrets', async () => {
  for (const server of ['nginx','envoy','cloudflare','Apache','nginx/1.2.3','privateShortSecret','apache']) {
    const logs=[];
    await assert.rejects(requestJson('https://example.invalid',{},'authentication',{emit:x=>logs.push(x),fetchImpl:async()=>new Response('<html>Service Unavailable</html>',{status:503,headers:{server}})}),{kind:'http_error'});
    assert.equal(logs[0].headers.server,['nginx','envoy','cloudflare','Apache'].includes(server)?server:'[value omitted]');
    assert.ok(!JSON.stringify(logs).includes('privateShortSecret'));
  }
});
const batchCodes = ['66070004','66825000','67100000'];
const stationResponse = code => response({code:200,items:[{codigoestacao:code,Data_Hora_Medicao:'2026-11-07 07:00:00',Cota_Adotada:133}]});
test('three-station batch authenticates exactly once and reuses its private token', async () => {
  const calls=[], logs=[];
  const result=await runBatch({env,includeInventory:false,stations:batchCodes,emit:x=>logs.push(x),fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/OAUth/v1')) return successAuth();
    return stationResponse(new URL(url).searchParams.get('Código da Estação'));
  }});
  assert.equal(calls.filter(c=>c.url.endsWith('/OAUth/v1')).length,1);
  assert.equal(calls.length,4);
  for(const call of calls.slice(1)) assert.equal(call.options.headers.Authorization,'Bearer '+token);
  assert.deepEqual(result.results.map(r=>r.station_code),batchCodes);
  assert.equal(result.successful_stations,3);
  assert.equal(result.outcome,'success');
  assert.ok(!JSON.stringify(logs).includes(token));
  assert.equal(result.automatic_refresh,false);
});
test('batch authentication401 prevents every series query without a retry', async () => {
  let calls=0;
  await assert.rejects(runBatch({env,includeInventory:false,stations:batchCodes,emit:()=>{},fetchImpl:async()=>{calls++;return response({code:401,message:'Unauthorized'},401);}}),{kind:'http_error'});
  assert.equal(calls,1);
});
test('intermediate station failure preserves earlier and later successes without reauthentication', async () => {
  const calls=[];
  const result=await runBatch({env,includeInventory:false,stations:batchCodes,emit:()=>{},fetchImpl:async(url)=>{
    calls.push(url);
    if(url.endsWith('/OAUth/v1')) return successAuth();
    const code=new URL(url).searchParams.get('Código da Estação');
    return code===batchCodes[1] ? response({code:503,message:'Service Unavailable'},503) : stationResponse(code);
  }});
  assert.equal(calls.length,4);
  assert.equal(result.outcome,'partial_success');
  assert.equal(result.successful_stations,2);
  assert.equal(result.failed_stations,1);
  assert.deepEqual(result.results.map(r=>[r.station_code,r.ready_for_mapping]),[[batchCodes[0],true],[batchCodes[1],false],[batchCodes[2],true]]);
});
test('batch excludes mismatched station data independently for each result', async () => {
  const result=await runBatch({env,includeInventory:false,stations:batchCodes,emit:()=>{},fetchImpl:async(url)=>url.endsWith('/OAUth/v1')?successAuth():stationResponse(batchCodes[0])});
  assert.equal(result.results[0].ready_for_mapping,true);
  for(const r of result.results.slice(1)) { assert.equal(r.ready_for_mapping,false);assert.equal(r.mismatched_station_records,1);assert.equal(r.latest_measurement,null); }
});
test('session expires before manual60minutes and never refreshes automatically', async () => {
  let clock=1000,calls=0;const logs=[];
  const session=await openSession({env,now:()=>clock,emit:x=>logs.push(x),fetchImpl:async()=>{calls++;return successAuth();}});
  assert.ok(SESSION_TTL_MS < 60*60*1000);
  clock+=SESSION_TTL_MS;
  await assert.rejects(session.queryStation(batchCodes[0]),{kind:'session_expired'});
  await assert.rejects(session.queryStation(batchCodes[1]),{kind:'session_expired'});
  assert.equal(calls,1);
  assert.ok(logs.some(r=>r.outcome==='session_expired'));
  session.close();
});
test('closed session cannot query or authenticate again', async () => {
  let calls=0;
  const session=await openSession({env,emit:()=>{},fetchImpl:async()=>{calls++;return successAuth();}});
  session.close();
  await assert.rejects(session.queryStation(batchCodes[0]),{kind:'session_closed'});
  assert.equal(calls,1);
});
test('session query401 is returned as an error and does not refresh the token', async () => {
  let calls=0;
  const session=await openSession({env,emit:()=>{},fetchImpl:async()=>++calls===1?successAuth():response({code:401,message:'Unauthorized'},401)});
  await assert.rejects(session.queryStation(batchCodes[0]),{kind:'http_error'});
  assert.equal(calls,2);
  session.close();
});
test('invalid batch station is rejected before authentication', async () => {
  let calls=0;
  await assert.rejects(runBatch({env,includeInventory:false,stations:[batchCodes[0],'bad'],emit:()=>{},fetchImpl:async()=>{calls++;return successAuth();}}),{kind:'invalid_configuration'});
  assert.equal(calls,0);
});
const inventoryResponse = code => response({code:200,items:[{codigoestacao:code,Estacao_Nome:'Estação pública',Municipio_Nome:'Cáceres',UF_Estacao:'MT',Tipo_Estacao:'Fluviométrica',Operando:'1',Latitude:'-16.07',Longitude:'-57.68',tokenautenticacao:token,Senha:'do-not-emit',private_field:'do-not-emit'}]});
test('inventory and series for three stations reuse one authentication and whitelist metadata', async () => {
  const calls=[],logs=[];
  const result=await runBatch({env,stations:batchCodes,emit:x=>logs.push(x),fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/OAUth/v1')) return successAuth();
    const code=new URL(url).searchParams.get('Código da Estação');
    return url.includes('/HidroInventarioEstacoes/v1?') ? inventoryResponse(code) : stationResponse(code);
  }});
  assert.equal(calls.length,7);
  assert.equal(calls.filter(c=>c.url.endsWith('/OAUth/v1')).length,1);
  for(const call of calls.slice(1)) assert.equal(call.options.headers.Authorization,'Bearer '+token);
  assert.equal(result.inventory_requested,true);
  for(const r of result.results) {
    assert.equal(r.station_identity_verified,true);
    assert.deepEqual(r.inventory.stations[0],{station_code:r.station_code,station_name:'Estação pública',municipality:'Cáceres',state:'MT',station_type:'Fluviométrica',operating:1,latitude:-16.07,longitude:-57.68});
  }
  assert.ok(!JSON.stringify(logs).includes(token));assert.ok(!JSON.stringify(logs).includes('do-not-emit'));
  assert.deepEqual(Object.fromEntries(new URL(inventoryUrl(batchCodes[0])).searchParams),{'Código da Estação':batchCodes[0]});
});
test('inventory failure does not discard a successful series or trigger a refresh', async () => {
  let calls=0;
  const result=await runBatch({env,stations:[batchCodes[0]],emit:()=>{},fetchImpl:async(url)=>{
    calls++;
    return url.endsWith('/OAUth/v1') ? successAuth() : url.includes('/HidroInventarioEstacoes/v1?') ? response({code:503},503) : stationResponse(batchCodes[0]);
  }});
  assert.equal(calls,3);assert.equal(result.results[0].ready_for_mapping,true);assert.equal(result.results[0].station_identity_verified,false);assert.equal(result.results[0].inventory.outcome,'failed');
});
test('inventory matching another station cannot verify requested identity', async () => {
  const session=await openSession({env,emit:()=>{},fetchImpl:async(url)=>url.endsWith('/OAUth/v1')?successAuth():inventoryResponse(batchCodes[1])});
  const inventory=await session.queryInventory(batchCodes[0]);
  assert.equal(inventory.outcome,'no_matching_station');assert.equal(inventory.stations.length,0);
  session.close();
});
test('latest measurement retains numeric QC flags without treating them as approval', async () => {
  for(const quality of [0,1,2,'1',null,'invalid']) {
    const result=await run({env,emit:()=>{},fetchImpl:async(url)=>url.endsWith('/OAUth/v1')?successAuth():response({code:200,items:[{codigoestacao:'66070004',Data_Hora_Medicao:'2026-11-07 07:00:00',Cota_Adotada:133,Cota_Adotada_Status:quality}]})});
    assert.equal(result.latest_measurement.Cota_Adotada_Status,quality===null || quality==='invalid'?null:Number(quality));
  }
});
test('batch summary and returned values cannot reintroduce redacted secrets from timestamps', async () => {
  const logs=[];const secret='07:00';
  const result=await runBatch({env:{...env,ANA_SENHA:secret},includeInventory:false,stations:[batchCodes[0]],emit:x=>logs.push(x),fetchImpl:async(url)=>url.endsWith('/OAUth/v1')?successAuth():stationResponse(batchCodes[0])});
  assert.ok(!JSON.stringify(logs).includes(secret));assert.ok(!JSON.stringify(result).includes(secret));
});
test('inventory strings are redacted before truncation can split a reflected credential', async () => {
  const secret='partial-secret-that-must-not-leak';
  const session=await openSession({env:{...env,ANA_SENHA:secret},emit:()=>{},fetchImpl:async(url)=>url.endsWith('/OAUth/v1')?successAuth():response({code:200,items:[{codigoestacao:batchCodes[0],Estacao_Nome:'x '.repeat(75)+secret}]})});
  const result=await session.queryInventory(batchCodes[0]);
  assert.ok(!JSON.stringify(result).includes('partial-'));
  session.close();
});
