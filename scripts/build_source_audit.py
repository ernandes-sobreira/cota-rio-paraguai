"""Pair official source records by station and exact date; no calibration/infill."""
import calendar, csv, datetime, json, statistics, tarfile, xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def timed_readings():
    lookup={}
    with tarfile.open(ROOT/'data/snapshots/ana-history-2026-10-11.tar.gz') as archive:
        for name,code in [('Cáceres','66070004'),('Ladário','66825000'),('Porto Murtinho','67100000')]:
            for node in ET.fromstring(archive.extractfile(code+'.xml').read()).iter('SerieHistorica'):
                row={c.tag:(c.text or '').strip() for c in node}
                if row.get('EstacaoCodigo')!=code or row.get('MediaDiaria')!='0' or row.get('NivelConsistencia')!='1':continue
                stamp=datetime.datetime.strptime(row['DataHora'],'%Y-%m-%d %H:%M:%S')
                if stamp.year!=2025 or stamp.hour not in (7,17):continue
                for day in range(1,calendar.monthrange(stamp.year,stamp.month)[1]+1):
                    key=f'Cota{day:02}';raw=row.get(key)
                    if not raw or row.get(key+'Status','') not in ('','1'):continue
                    lookup[(name,stamp.replace(day=day).date().isoformat(),stamp.hour)]=float(raw.replace(',','.'))/100
    return lookup

def compare(marine,ana,timed=None):
    timed=timed or {}
    lookup={(r['station'],r['date_str']):float(r['cota_m']) for r in ana}
    pairs=[]; summaries={}
    for name in ['Cáceres','Ladário','Porto Murtinho']:
        selected=[r for r in marine['observations'] if r['station']==name]
        rr=[]
        for r in selected:
            value=lookup.get((name,r['date']))
            if value is None:continue
            rr.append(dict(station=name,date=r['date'],marinha_m=r['level_m'],ana_daily_mean_m=value,
                           ana_07h_m=timed.get((name,r['date'],7)),ana_17h_m=timed.get((name,r['date'],17)),
                           difference_cm=round(100*(r['level_m']-value),6),marinha_source_url=r['source_url']))
        diff=[r['difference_cm'] for r in rr]
        if not diff:raise ValueError('No paired dates for '+name)
        summaries[name]=dict(n=len(rr),marinha_days=len(selected),ana_missing=len(selected)-len(rr),
            start=min(r['date'] for r in rr),end=max(r['date'] for r in rr),
            equal=sum(abs(d)<1e-6 for d in diff),within_1cm=sum(abs(d)<=1.000001 for d in diff),
            mean_difference_cm=round(statistics.mean(diff),6),
            mean_absolute_difference_cm=round(statistics.mean(abs(d) for d in diff),6),
            max_absolute_difference_cm=max(abs(d) for d in diff),
            largest_differences=sorted(rr,key=lambda r:abs(r['difference_cm']),reverse=True)[:5])
        morning=[100*(r['marinha_m']-r['ana_07h_m']) for r in rr if r['ana_07h_m'] is not None]
        summaries[name]['ana_07h_pairs']=len(morning)
        summaries[name]['mean_absolute_difference_07h_cm']=round(statistics.mean(abs(d) for d in morning),6) if morning else None
        pairs+=rr
    return {'schema_version':1,'scope':'Datas coincidentes nas tabelas recuperadas de 2025. Não representa toda a série histórica.',
            'difference_definition':'Marinha menos média diária publicada ANA, em centímetros.',
            'interpretation':'Diferenças numéricas não certificam equivalência de horário, ponto ou zero de régua. Não foi aplicada correção de nível nem fusão estatística.',
            'sources':marine['sources'],'stations':summaries},pairs

def build():
    marine=json.loads((ROOT/'data/history-marinha.json').read_text())
    with (ROOT/'data/history-ana.csv').open() as f:ana=list(csv.DictReader(f))
    summary,pairs=compare(marine,ana,timed_readings())
    (ROOT/'data/source-audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    with (ROOT/'data/source-audit.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(pairs[0]));w.writeheader();w.writerows(pairs)
    print(json.dumps(summary['stations'],ensure_ascii=False,indent=2))

if __name__=='__main__':build()
