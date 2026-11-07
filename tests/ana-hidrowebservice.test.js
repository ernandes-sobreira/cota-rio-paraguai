import test from 'node:test';
import assert from 'node:assert/strict';
import { run, seriesUrl, requestJson, safeErrorBody, TIMEOUT_MS } from '../scripts/ana_hidrowebservice.mjs';
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
  assert.deepEqual(result.latest_measurement,{measured_at:'2026-11-07 07:00:00',level_cm:133});
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
