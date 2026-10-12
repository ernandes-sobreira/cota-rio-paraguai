"""Collect the public CHN-6 table. No API key, inference or gap filling."""
import argparse
import gzip
import csv
import hashlib
import io
import json
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.error
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.marinha.mil.br/chn-6/'
STATIONS = {'caceres': 'Cáceres', 'ladario': 'Ladário', 'porto murtinho': 'Porto Murtinho'}

def plain(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s.lower()) if not unicodedata.combining(c)).strip()

class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.row, self.cell = [], None, None
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.row = []
        if tag in ('td', 'th') and self.row is not None: self.cell = []
        if tag == 'br' and self.cell is not None: self.cell.append(' ')
    def handle_data(self, data):
        if self.cell is not None: self.cell.append(data)
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(re.sub(r'\s+', ' ', ''.join(self.cell)).strip())
            self.cell = None
        if tag == 'tr' and self.row is not None:
            self.rows.append(self.row)
            self.row = None

def number(s):
    raw=s.strip().rstrip(';').strip()
    if not raw:return None
    if plain(raw) in ('estacionado','estavel'):return 0.0
    m=re.fullmatch(r'([+−-]?\s*\d+(?:[,.]\d+)?)\s*[mM]?',raw)
    if not m:raise ValueError('Número não reconhecido na célula oficial')
    return float(re.sub(r'\s','',m[1]).replace(',','.').replace('−','-'))

def parse_html(html, today=None):
    today = today or datetime.now(ZoneInfo('America/Campo_Grande')).date()
    p = Tables(); p.feed(html)
    out = {}
    for row in p.rows:
        if len(row) < 4 or plain(row[1]) not in STATIONS: continue
        station = STATIONS[plain(row[1])]
        match = re.fullmatch(r'\s*(\d{2})/(\d{2})/(\d{4})\s*', row[0])
        if not match: raise ValueError(f'Data não reconhecida: {station}')
        d, m, y = map(int, match.groups()); day = date(y, m, d)
        value = number(row[2])
        if day > today: raise ValueError(f'Data futura: {station}')
        if value is None or not -10 <= value <= 30: raise ValueError(f'Cota inválida: {station}')
        record = dict(station=station, date=day.isoformat(), level_m=value,
                      variation_m=number(row[3]), observation=row[4] if len(row) > 4 else '',
                      source_url=SOURCE, measurement_time=None, raw_cells=row)
        if station in out and out[station] != record: raise ValueError(f'Linhas conflitantes: {station}')
        out[station] = record
    if set(out) != set(STATIONS.values()):
        raise ValueError('Tabela incompleta ou estrutura da fonte alterada; preservando última coleta.')
    return list(out.values())

def merge_records(old, new):
    merged = {(r['station'], r['date']): r for r in old}
    for r in new: merged[(r['station'], r['date'])] = r
    return sorted(merged.values(), key=lambda r: (r['date'], r['station']))

def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    temp.replace(path)

def freshness(records, today=None):
    today = today or datetime.now(ZoneInfo('America/Campo_Grande')).date()
    by_station = {r['station']: r['date'] for r in records}
    stale = [name for name in STATIONS.values() if by_station.get(name) != today.isoformat()]
    return dict(observation_status='stale' if stale else 'current', stale_stations=stale)

def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument('--html', type=Path); args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    data = ROOT / 'data'
    latest_path = data / 'latest.json'; archive_path = data / 'daily.json'
    previous = json.loads(latest_path.read_text()) if latest_path.exists() else {}
    status = dict(previous, schema_version=2, source_url=SOURCE, checked_at=now,
                  schedule_local=['07:20', '08:20', '10:20', '14:20'], timezone='America/Campo_Grande')
    try:
        if args.html:
            body = args.html.read_bytes()
        else:
            for attempt in range(3):
                try:
                    req = urllib.request.Request(SOURCE, headers={'User-Agent': 'Mozilla/5.0 (compatible; CotaRioParaguai/2.0; +https://ernandes-sobreira.github.io/cota-rio-paraguai/)', 'Accept': 'text/html'})
                    with urllib.request.urlopen(req, timeout=45) as response:
                        body = response.read(3_000_000)
                    break
                except urllib.error.HTTPError as exc:
                    # Do not retry an access refusal; no alternate route or credentials.
                    if 400 <= exc.code < 500 or attempt == 2: raise
                    time.sleep(3 * (attempt + 1))
                except (urllib.error.URLError, TimeoutError):
                    if attempt == 2: raise
                    time.sleep(3 * (attempt + 1))
        records = parse_html(body.decode('utf-8', errors='replace'))
        sha = hashlib.sha256(body).hexdigest()
        for record in records:
            record['collected_at'] = now; record['source_sha256'] = sha; record['collection_method']='direct_official_html'
        old = json.loads(archive_path.read_text()) if archive_path.exists() else []
        # Preserve collection timestamps when the observation itself did not change.
        previous_by_key = {(r['station'], r['date']): r for r in old}
        for i, r in enumerate(records):
            prior = previous_by_key.get((r['station'], r['date']))
            if prior and all(r[k] == prior.get(k) for k in ('level_m', 'variation_m', 'observation', 'raw_cells')):
                records[i] = prior
        merged = merge_records(old, records)
        latest = [max((r for r in merged if r['station'] == s), key=lambda r: r['date']) for s in STATIONS.values()]
        observed_days = {r['station']: r['date'] for r in records}
        if any(observed_days[r['station']] < r['date'] for r in latest):
            raise ValueError('Fonte retornou observações anteriores à base preservada; consulta não valida as leituras mais recentes.')
        status.update(fetch_status='ok', last_success_at=now, last_direct_attempt_at=now, direct_status='ok', stations=latest, error=None, **freshness(latest))
        dump(archive_path, merged)
        # Git provides the complete revision trail; one raw table snapshot per collection date.
        (data / 'snapshots').mkdir(parents=True,exist_ok=True)
        (data / 'snapshots' / (now[:10] + '-marinha.html.gz')).write_bytes(gzip.compress(body,mtime=0))
        dump(data / 'snapshots' / (now[:10] + '.json'), dict(source_url=SOURCE, fetched_at=now, sha256=sha, rows=[r['raw_cells'] for r in records]))
        stream = io.StringIO(newline=''); w = csv.writer(stream,lineterminator="\n")
        w.writerow(['station', 'date', 'cota_m', 'variacao_publicada_m', 'source_url', 'collected_at', 'observation'])
        for r in merged: w.writerow([r['station'], r['date'], r['level_m'], '' if r['variation_m'] is None else r['variation_m'], SOURCE, r['collected_at'], r['observation']])
        (data / 'daily.csv').write_text(stream.getvalue(), encoding='utf-8')
        dump(latest_path, status)
        print('Coleta validada:', ', '.join(f"{r['station']} {r['date']} {r['level_m']:.2f} m" for r in latest))
    except Exception as exc:
        status.update(fetch_status='error', last_direct_attempt_at=now, direct_status='unavailable', error=f'{type(exc).__name__}: {exc}', **freshness(previous.get('stations', [])))
        dump(latest_path, status)
        print('Falha na coleta; última medição preservada:', str(exc), file=sys.stderr)
        # A successful run must never hide a refused collection.
        if isinstance(exc, urllib.error.HTTPError) and exc.code == 403:
            print('::error::Fonte recusou coleta direta (403); última leitura preservada. Nenhum complemento foi confirmado nesta execução.')
        return 1
    return 0

if __name__ == '__main__': sys.exit(main())
