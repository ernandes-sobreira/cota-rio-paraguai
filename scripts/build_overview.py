"""Calendar-day profiles and annual summaries for the minimal dashboard.

Calendar days are grouped by MM-DD, never by unadjusted day-of-year.
February 29 retains only actual leap-day observations. No smoothing or infill.
"""
import csv
import json
import statistics
from collections import Counter
from collections import defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def profile(rows):
    groups=defaultdict(list)
    for row in rows:groups[row['date_str'][5:]].append(float(row['cota_m']))
    return [[key, min(v),max(v),statistics.mean(v),statistics.stdev(v) if len(v)>1 else None,len(v)] for key,v in sorted(groups.items())]

def build():
    rows=defaultdict(list)
    with (ROOT/'data/history-ana.csv').open() as f:
        for r in csv.DictReader(f):
            if r['cota_m'].strip():rows[r['station']].append(r)
    historical=json.loads((ROOT/'data/statistics.json').read_text())
    result={'schema_version':2,'period':[1966,2025],'stations':{}}
    for name,rr in rows.items():
        a=historical['stations'][name]
        counts=sorted(Counter(round(float(r['cota_m']),6) for r in rr).items())
        same_day={}
        for r in rr:same_day.setdefault(r['date_str'][5:],[]).append(round(float(r['cota_m']),6))
        by_date={r['date_str']:round(float(r['cota_m']),6) for r in rr if r['date_str'][:4]=='2025'}
        result['stations'][name]={'distribution':counts,'calendar_values':same_day,'by_date':by_date,'profile':profile(rr),'annual':[[x['year'],x['min'],x['max'],x['mean'],x['sd'],x['n'],x['coverage']] for x in a['annual']], 'n':a['n'],'min':a['min'],'max':a['max'],'mean':a['mean'],'sd':a['sd'],'start':a['start'],'end':a['end']}
    def round_values(obj):
        if isinstance(obj,float):return round(obj,6)
        if isinstance(obj,list):return [round_values(v) for v in obj]
        if isinstance(obj,dict):return {k:round_values(v) for k,v in obj.items()}
        return obj
    result=round_values(result)
    (ROOT/'data/overview.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    print('Perfis diários gerados:',[(k,len(v['profile'])) for k,v in result['stations'].items()])

if __name__=='__main__':build()
