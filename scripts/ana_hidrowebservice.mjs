#!/usr/bin/env node
// Isolated validation: never writes public feeds, retries authentication, or logs tokens.
import { pathToFileURL } from 'node:url';
export const BASE = 'https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas';
export const TIMEOUT_MS = 90000;
const SAFE_MESSAGES = new Set(['Unauthorized', 'Forbidden', 'Bad Request', 'Internal Server Error', 'Service Unavailable', 'Gateway Timeout', 'Não autorizado', 'Não Autorizado', 'Credenciais inválidas ou ausência de autenticação', 'Credenciais inválidas ou ausência de autenticação.', 'Usuário ou senha inválidos', 'Usuário ou senha inválidos.', 'Usuário bloqueado', 'Usuário bloqueado.', 'Identificador ou senha inválidos', 'Identificador ou senha inválidos.', 'Sucesso']);
const SAFE_HTML_TITLES = new Set(['503 Service Unavailable', '503 Service Temporarily Unavailable', 'Service Unavailable', 'Access Denied', 'Request Rejected']);
const SAFE_SERVERS = new Set(['nginx', 'envoy', 'cloudflare', 'Apache']);
const httpCode = value => /^(?:[1-5]\d{2})$/.test(String(value)) ? Number(value) : null;
function safeHeaders(headers) {
  const result = {};
  const type = headers.get('content-type');
  if (type && /^(?:application\/(?:json|problem\+json)|text\/(?:html|plain|xml)|application\/xml)(?:;\s*charset=(?:utf-8|iso-8859-1|us-ascii))?$/i.test(type)) result['content-type'] = type;
  const date = headers.get('date');
  if (date && /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(date) && Number.isFinite(Date.parse(date))) result.date = date;
  const size = headers.get('content-length');
  if (size !== null && /^\d{1,9}$/.test(size)) result['content-length'] = Number(size);
  if (headers.has('server')) result.server = SAFE_SERVERS.has(headers.get('server')) ? headers.get('server') : '[value omitted]';
  for (const key of ['retry-after','x-request-id','set-cookie','authorization']) if (headers.has(key)) result[key] = '[value omitted]';
  return result;
}

export function redact(value, secrets = []) {
  let text = String(value);
  for (const secret of secrets.filter(Boolean).sort((a,b) => b.length-a.length)) {
    for (const variant of new Set([secret, encodeURIComponent(secret)])) text = text.split(variant).join('[redacted]');
  }
  return text.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[identifier]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[identifier]')
    .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2}\b/g, '[token]')
    .replace(/((?:senha|password|token\w*|authorization|cookie|identificador)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;<>]+)/gi, '$1[redacted]')
    .replace(/[A-Za-z0-9_+\/-]{32,}={0,2}/g, '[opaque-value]');
}
export function safeErrorBody(raw, secrets = []) {
  // Error responses may contain unknown tokens. Never output arbitrary text or fields.
  let body;
  try { body = JSON.parse(raw); } catch {
    const selected = {format:'non_json', bytes:Buffer.byteLength(raw), text_omitted:true};
    // Markers describe observed HTML phrases, not a diagnosis of their cause.
    if (/<(?:!doctype\s+html|html|head|body)\b/i.test(raw)) {
      const markers = [];
      if (/\bservice (?:temporarily )?unavailable\b/i.test(raw)) markers.push('service_unavailable');
      if (/\baccess denied\b/i.test(raw)) markers.push('access_denied');
      if (/\brequest rejected\b/i.test(raw)) markers.push('request_rejected');
      if (/\b(?:verify (?:that )?you are (?:a )?human|checking your browser|automated traffic|bot detection|security challenge)\b/i.test(raw)) markers.push('bot_or_security_challenge');
      selected.html_markers = markers;
      const title = raw.match(/<title(?:\s[^>]*)?>([^<]*)<\/title\s*>/i)?.[1]?.trim();
      if (SAFE_HTML_TITLES.has(title)) selected.title = redact(title, secrets);
    }
    return selected;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { format:'json', omitted:'unexpected_json_shape' };
  const selected = {format:'json'};
  for (const key of ['status','code']) {
    if (httpCode(body[key]) !== null) selected[key] = httpCode(body[key]);
    else if (key === 'status' && ['OK','ERROR','UNAUTHORIZED','FORBIDDEN'].includes(body[key])) selected[key] = redact(body[key], secrets);
  }
  for (const key of ['message','error']) if (Object.hasOwn(body,key)) {
    selected[key] = typeof body[key] === 'string' && SAFE_MESSAGES.has(body[key]) ? redact(body[key], secrets) : '[value omitted]';
  }
  return selected;
}
// Parameter names verified against official OpenAPI v1.0.3984.2 on 2026-11-07, not the PDF Java example.
export function seriesUrl(station, date = new Date().toISOString().slice(0, 10)) {
  const query = new URLSearchParams({
    'Código da Estação': station,
    'Tipo Filtro Data': 'DATA_LEITURA',
    'Data de Busca (yyyy-MM-dd)': date,
    'Range Intervalo de busca': 'DIAS_7'
  });
  return BASE + '/HidroinfoanaSerieTelemetricaAdotada/v1?' + query;
}
export function inventoryUrl(station) {
  return BASE + '/HidroInventarioEstacoes/v1?' + new URLSearchParams({'Código da Estação':station});
}
function numericCoordinate(value, bound) {
  if (!(typeof value === 'number' || (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())))) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= bound ? number : null;
}
function inventorySummary(data, station, sanitizeText) {
  if (!Array.isArray(data?.items)) throw new AnaError('unexpected_inventory_shape');
  const selected = data.items.filter(item => String(item?.codigoestacao) === station).map(item => ({
    station_code:station,
    station_name:typeof item.Estacao_Nome === 'string' ? sanitizeText(item.Estacao_Nome).slice(0,160) : null,
    municipality:typeof item.Municipio_Nome === 'string' ? sanitizeText(item.Municipio_Nome).slice(0,160) : null,
    state:typeof item.UF_Estacao === 'string' && /^[A-Z]{2}$/.test(item.UF_Estacao) ? item.UF_Estacao : null,
    station_type:typeof item.Tipo_Estacao === 'string' ? sanitizeText(item.Tipo_Estacao).slice(0,80) : null,
    operating:/^[01]$/.test(String(item.Operando)) ? Number(item.Operando) : null,
    latitude:numericCoordinate(item.Latitude,90), longitude:numericCoordinate(item.Longitude,180)
  }));
  return {stage:'inventory', station_code:station, outcome:selected.length ? 'success' : 'no_matching_station',
    records_returned:data.items.length, matching_station_records:selected.length,
    stations:selected, public_data_changed:false};
}
export class AnaError extends Error {
  constructor(kind) { super(kind); this.name = 'AnaError'; this.kind = kind; }
}
async function readBounded(response, limit) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new AnaError('response_too_large'); }
      text += decoder.decode(value, {stream:true});
    }
  } finally { reader.releaseLock(); }
}
export async function requestJson(url, headers, stage, options = {}) {
  const { fetchImpl = fetch, emit = () => {}, secrets = [], timeoutMs = TIMEOUT_MS,
    maxBytes = stage === 'authentication' ? 1024 * 1024 : 8 * 1024 * 1024 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  let response;
  try {
    response = await fetchImpl(url, { method:'GET', headers, redirect:'error', signal:controller.signal });
    const metadata = { stage, checked_at:new Date(started).toISOString(), http_status:response.status, elapsed_ms:Date.now()-started,
      headers:safeHeaders(response.headers) };
    let raw;
    try { raw = await readBounded(response, maxBytes); }
    catch (error) {
      if (error instanceof AnaError) { emit({...metadata, outcome:error.kind}); throw error; }
      throw error;
    }
    let body;
    try { body = JSON.parse(raw); } catch { /* Report the response, not a parser exception containing it. */ }
    const apiCode = httpCode(body?.code);
    if (!response.ok || (apiCode !== null && apiCode >= 400) || body === undefined) {
      const kind = !response.ok ? 'http_error' : apiCode >= 400 ? 'api_error' : 'non_json_response';
      emit({...metadata, api_status:apiCode, outcome:kind, body:safeErrorBody(raw, secrets)});
      throw new AnaError(kind);
    }
    // Even a successful authentication response is never printed or persisted.
    emit({...metadata, api_status:apiCode, outcome:'response_received'});
    return body;
  } catch (error) {
    if (error instanceof AnaError) throw error;
    const kind = controller.signal.aborted ? 'timeout' : 'network_error';
    emit({stage, checked_at:new Date(started).toISOString(), outcome:kind, http_status:response?.status ?? null, elapsed_ms:Date.now()-started});
    throw new AnaError(kind);
  } finally { clearTimeout(timer); }
}
function summarizeSeries(data, station) {
  const mismatched = data.items.filter(r => r?.codigoestacao != null && String(r.codigoestacao) !== station).length;
  const measurements = data.items.filter(r => r?.codigoestacao == null || String(r.codigoestacao) === station).filter(r => typeof r?.Data_Hora_Medicao === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?$/.test(r.Data_Hora_Medicao))
    .filter(r => typeof r.Cota_Adotada === 'number' || (typeof r.Cota_Adotada === 'string' && /^-?\d+(?:\.\d+)?$/.test(r.Cota_Adotada.trim())))
    .map(r => ({measured_at:r.Data_Hora_Medicao.slice(0, 19), level_cm:Number(r.Cota_Adotada), Cota_Adotada_Status:/^[012]$/.test(String(r.Cota_Adotada_Status)) ? Number(r.Cota_Adotada_Status) : null}))
    .filter(r => Number.isFinite(r.level_cm) && Math.abs(r.level_cm) < 100000).sort((a,b) => a.measured_at.localeCompare(b.measured_at));
  const result = {stage:'series', outcome:measurements.length ? 'success' : data.items.length ? 'no_valid_measurements' : 'empty_result', source:'ANA HidroWebService', station_code:station,
    records_returned:data.items.length, valid_level_records:measurements.length, mismatched_station_records:mismatched, ready_for_mapping:measurements.length > 0,
    latest_measurement:measurements.at(-1) ?? null, checked_at:new Date().toISOString(), public_data_changed:false};
  return result;
}
// Manual token validity is 60 minutes. Stop five minutes early; never refresh implicitly.
export const SESSION_TTL_MS = 55 * 60 * 1000;
function validateStations(stations) {
  if (!Array.isArray(stations) || stations.length < 1 || stations.length > 10 ||
      stations.some(station => typeof station !== 'string' || !/^\d{7,10}$/.test(station))) {
    throw new AnaError('invalid_configuration');
  }
  return [...new Set(stations)];
}
export async function openSession({ env = process.env, fetchImpl = fetch,
  emit = value => console.log(JSON.stringify(value)), timeoutMs = TIMEOUT_MS, now = Date.now } = {}) {
  const rawId = env.ANA_IDENTIFICADOR || '';
  const id = rawId.trim().replace(/[.\-\/\s]/g, '');
  const password = env.ANA_SENHA || ''; // Do not trim or otherwise change the password.
  const secrets = [rawId, id, password];
  let token = '', closed = false;
  const sanitize = value => typeof value === 'string' ? redact(value, secrets) : Array.isArray(value) ? value.map(sanitize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sanitize(item)])) : value;
  const safeEmit = value => { const safe = sanitize(value); emit(safe); return safe; };
  if (!/^(?:\d{11}|\d{14})$/.test(id) || !password || /[\r\n]/.test(password)) {
    safeEmit({stage:'configuration', outcome:'invalid_configuration',
      identifier_valid:/^(?:\d{11}|\d{14})$/.test(id), password_present:!!password,
      password_contains_linebreak:/[\r\n]/.test(password)});
    throw new AnaError('invalid_configuration');
  }
  safeEmit({stage:'configuration', outcome:'valid', password_has_edge_whitespace:password !== password.trim(), timeout_ms:timeoutMs});
  const options = {fetchImpl, emit:safeEmit, secrets, timeoutMs};
  const openedAt = now();
  const auth = await requestJson(BASE+'/OAUth/v1', {Identificador:id, Senha:password, Accept:'*/*'}, 'authentication', options);
  token = auth?.items?.tokenautenticacao ?? auth?.items?.tokenAutenticacao ?? auth?.tokenautenticacao;
  if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) {
    safeEmit({stage:'authentication', outcome:'missing_or_invalid_token'});
    throw new AnaError('missing_or_invalid_token');
  }
  secrets.push(token);
  safeEmit({stage:'authentication', outcome:'token_obtained', session_ttl_ms:SESSION_TTL_MS, automatic_refresh:false});
  return Object.freeze({
    async queryStation(station, date) {
      validateStations([station]);
      if (closed) throw new AnaError('session_closed');
      const elapsed = now() - openedAt;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= SESSION_TTL_MS) {
        safeEmit({stage:'series', station_code:station, outcome:'session_expired', automatic_refresh:false});
        throw new AnaError('session_expired');
      }
      const stationEmit = event => safeEmit({...event, station_code:station});
      const data = await requestJson(seriesUrl(station, date), {Authorization:'Bearer '+token, Accept:'*/*'}, 'series', {...options, emit:stationEmit});
      if (!Array.isArray(data?.items)) {
        stationEmit({stage:'series', outcome:'unexpected_records_shape'});
        throw new AnaError('unexpected_records_shape');
      }
      const result = summarizeSeries(data, station);
      return stationEmit(result);
    },
    async queryInventory(station) {
      validateStations([station]);
      if (closed) throw new AnaError('session_closed');
      const elapsed = now() - openedAt;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= SESSION_TTL_MS) {
        safeEmit({stage:'inventory', station_code:station, outcome:'session_expired', automatic_refresh:false});
        throw new AnaError('session_expired');
      }
      const stationEmit = event => safeEmit({...event, station_code:station});
      const data = await requestJson(inventoryUrl(station), {Authorization:'Bearer '+token, Accept:'*/*'}, 'inventory', {...options, emit:stationEmit});
      const result = sanitize(inventorySummary(data, station, text => redact(text, secrets)));
      return stationEmit(result);
    },
    reportSummary(value) { if (closed) throw new AnaError('session_closed'); return safeEmit(value); },
    close() { closed = true; token = ''; secrets.splice(0); }
  });
}
export async function run({station = '66070004', date, ...options} = {}) {
  validateStations([station]);
  const session = await openSession(options);
  try { return await session.queryStation(station, date); }
  finally { session.close(); }
}
export async function runBatch({stations = ['66070004'], date, includeInventory = true, emit = value => console.log(JSON.stringify(value)), ...options} = {}) {
  const codes = validateStations(stations);
  const session = await openSession({...options, emit});
  const results = [];
  try {
    for (const station of codes) {
      let inventory;
      if (includeInventory) {
        try { inventory = await session.queryInventory(station); }
        catch (error) {
          inventory = {stage:'inventory', station_code:station, outcome:'failed', reason:error instanceof AnaError ? error.kind : 'internal_error', public_data_changed:false};
          session.reportSummary(inventory);
        }
      }
      try {
        const result = await session.queryStation(station, date);
        results.push(includeInventory ? {...result, inventory, station_identity_verified:inventory.outcome === 'success'} : result);
      }
      catch (error) {
        const failure = {stage:'series', station_code:station, outcome:'failed',
          reason:error instanceof AnaError ? error.kind : 'internal_error', ready_for_mapping:false, public_data_changed:false};
        results.push(includeInventory ? {...failure, inventory, station_identity_verified:inventory.outcome === 'success'} : failure);
        session.reportSummary(failure);
      }
    }
    const successful = results.filter(result => result.ready_for_mapping).length;
    const failed = results.filter(result => result.outcome === 'failed').length;
    const summary = {stage:'batch', outcome:successful === results.length ? 'success' : successful ? 'partial_success' : failed ? 'failed' : 'no_valid_measurements',
      stations_requested:codes.length, successful_stations:successful, failed_stations:failed,
      results, inventory_requested:includeInventory, automatic_refresh:false, public_data_changed:false};
    return session.reportSummary(summary);
  } finally { session.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stations = process.argv.slice(2).length ? process.argv.slice(2) : ['66070004'];
  runBatch({stations}).then(result => {
    if (result.outcome !== 'success') process.exitCode = 1;
  }).catch(error => {
    console.error(JSON.stringify({outcome:'failed', reason:error instanceof AnaError ? error.kind : 'internal_error'}));
    process.exitCode = 1;
  });
}
