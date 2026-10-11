"""Reproduce the selected 2025 CHN-6 tables from archived public PDF text.

The binary PDFs could not be downloaded in this audit. Exact table text, URL,
page and capture time are preserved. Reject ambiguous/missing cell counts;
never interpolate, reconstruct from changes, or infer an absent observation.
"""
import calendar, csv, datetime, hashlib, json, re, statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def parse_snapshot(s):
    year = s['year']; end = datetime.date.fromisoformat(s['coverage_end'])
    if year != end.year or s['coverage_start'] != f'{year}-01-01':
        raise ValueError('Unsupported table scope')
    if not s['source_url'].startswith('https://www.marinha.mil.br/chn-6/sites/'):
        raise ValueError('Non-official source')
    if f"{s['station'].upper()} {year}" not in s['extracted_text']:
        raise ValueError('Station/year title missing')
    if 'DIAS JAN FEV MAR ABR MAI JUN JUL AGO SET OUT NOV DEZ' not in s['extracted_text']:
        raise ValueError('Month header missing')
    rows=[]; days=set()
    for line in s['extracted_text'].splitlines():
        text=line.split(': ',1)[-1]
        m=re.fullmatch(r'(\d{1,2})((?: -?\d+,\d{2})+)',text)
        if not m: continue
        day=int(m[1]); values=[float(v.replace(',','.')) for v in m[2].split()]
        if day in days or not 1<=day<=31: raise ValueError('Repeated/invalid day')
        days.add(day)
        dates=[datetime.date(year,month,day) for month in range(1,13)
               if day<=calendar.monthrange(year,month)[1]
               and datetime.date(year,month,day)<=end]
        if len(values)!=len(dates): raise ValueError(f'Ambiguous cells: day {day}')
        for date,value in zip(dates,values):
            if not -10<=value<=30: raise ValueError('Invalid level')
            rows.append(dict(station=s['station'],date=date.isoformat(),level_m=value,
                source='Marinha do Brasil · CHN-6',source_url=s['source_url'],
                pdf_page=s['pdf_page'],measurement_time=None,captured_at=s['captured_at']))
    if days!=set(range(1,32)): raise ValueError('Incomplete table extraction')
    for label,expected in [('MÁXIMO',max(r['level_m'] for r in rows)),('MÍNIMO',min(r['level_m'] for r in rows)),('MÉDIO',statistics.mean(r['level_m'] for r in rows))]:
        m=re.search(r'NÍVEL '+label+r' DO RIO NO PERÍODO: (-?\d+,\d+)',s['extracted_text'])
        if not m or abs(float(m[1].replace(',','.'))-expected)>.011:
            raise ValueError('Published summary mismatch: '+label)
    return sorted(rows,key=lambda r:r['date'])

def build():
    observations=[]; sources=[]
    for path in sorted((ROOT/'data/snapshots').glob('marinha-*-2025-web.json')):
        snapshot=json.loads(path.read_text()); rows=parse_snapshot(snapshot)
        sources.append({k:snapshot[k] for k in ['station','source_url','pdf_page','coverage_start','coverage_end','captured_at','retrieval_method','verification_note']})
        sources[-1].update(snapshot_path=path.relative_to(ROOT).as_posix(),snapshot_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),days=len(rows))
        observations.extend(rows)
    if len(sources)!=3: raise ValueError('Three station tables required')
    out={'schema_version':1,'source':'Marinha do Brasil · CHN-6','scope':'Tabelas de 2025 recuperadas; não é toda a série histórica da Marinha.','sources':sources,'observations':observations}
    (ROOT/'data/history-marinha.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
    with (ROOT/'data/history-marinha.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(observations[0]));w.writeheader();w.writerows(observations)
    return out

if __name__=='__main__':
    result=build();print([(s['station'],s['days'],s['coverage_end']) for s in result['sources']])
