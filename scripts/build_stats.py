"""Reproducible descriptive statistics of the unmodified legacy CSV (stdlib)."""
import calendar
import collections
import csv
import hashlib
import json
import math
import statistics as st
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def quantile(values, p):
    a = sorted(values)
    if not a: return None
    k = (len(a)-1)*p; lo = math.floor(k); hi = math.ceil(k)
    return a[lo] + (a[hi]-a[lo])*(k-lo)

def trend(points):
    if len(points) < 10: return None
    x, y = zip(*points); xm, ym = st.mean(x), st.mean(y)
    sxx = sum((v-xm)**2 for v in x); syy = sum((v-ym)**2 for v in y)
    slope = sum((a-xm)*(b-ym) for a,b in points)/sxx
    intercept = ym-slope*xm
    residual = sum((b-(intercept+slope*a))**2 for a,b in points)
    n = len(y)
    slopes = [(y[j]-y[i])/(x[j]-x[i]) for i in range(n) for j in range(i+1,n)]
    score = sum((y[j]>y[i])-(y[j]<y[i]) for i in range(n) for j in range(i+1,n))
    ties = collections.Counter(y)
    var = (n*(n-1)*(2*n+5)-sum(t*(t-1)*(2*t+5) for t in ties.values()))/18
    z = ((score-1) if score>0 else (score+1) if score<0 else 0)/math.sqrt(var) if var else 0
    return dict(n=n, start=min(x), end=max(x), slope_m_year=slope, intercept=intercept,
                r2=1-residual/syy if syy>0 else None, sen_m_year=st.median(slopes),
                mk_s=score, mk_p_uncorrected=math.erfc(abs(z)/math.sqrt(2)))

def build(path):
    stations = collections.defaultdict(list); seen = set()
    with path.open(encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            day = date.fromisoformat(r['date_str']); key = (r['station'],day)
            if key in seen: raise ValueError(f'Duplicate: {key}')
            seen.add(key)
            if not r['cota_m'].strip(): continue
            value = float(r['cota_m'])
            if not math.isfinite(value): raise ValueError('Non-finite value')
            stations[r['station']].append((day, value))
    result = dict(schema_version=2, historical_source='ANA HidroSerieHistorica; médias diárias publicadas, nível de consistência 1; procedência em history-provenance.json.',
                  input_sha256=hashlib.sha256(path.read_bytes()).hexdigest(), baseline=[1991,2020], stations={})
    for name, rows in stations.items():
        rows.sort(); ys=collections.defaultdict(list); ms=collections.defaultdict(list); season=collections.defaultdict(list)
        for d,v in rows:
            ys[d.year].append((d,v)); ms[d.strftime('%Y-%m')].append(v)
            if 1991<=d.year<=2020: season[d.month].append((d.year,v))
        annual=[]; monthly=[]
        for y,rr in sorted(ys.items()):
            values=[v for _,v in rr]; expected=366 if calendar.isleap(y) else 365
            annual.append(dict(year=y,n=len(values),expected=expected,coverage=len(values)/expected,
                               mean=st.mean(values),median=st.median(values),min=min(values),max=max(values),
                               sd=st.stdev(values) if len(values)>1 else None, eligible=len(values)/expected>=.9))
        for period,values in sorted(ms.items()):
            y,m=map(int,period.split('-')); expected=calendar.monthrange(y,m)[1]
            monthly.append(dict(period=period,n=len(values),expected=expected,coverage=len(values)/expected,
                                mean=st.mean(values),min=min(values),max=max(values)))
        climatology=[]
        for m in range(1,13):
            rr=season[m]; values=[v for _,v in rr]
            climatology.append(dict(month=m,n=len(values),years=len(set(y for y,_ in rr)),
                                    p10=quantile(values,.1),median=quantile(values,.5),p90=quantile(values,.9)))
        values=[v for _,v in rows]; expected=(rows[-1][0]-rows[0][0]).days+1; lo=min(values); hi=max(values)
        result['stations'][name]=dict(start=rows[0][0].isoformat(),end=rows[-1][0].isoformat(),n=len(rows),
             expected=expected,missing=expected-len(rows),min=min(values),max=max(values),
             min_dates=[d.isoformat() for d,v in rows if v==lo],max_dates=[d.isoformat() for d,v in rows if v==hi],
             mean=st.mean(values),median=st.median(values),sd=st.stdev(values),p10=quantile(values,.1),p90=quantile(values,.9),
             annual=annual,monthly=monthly,climatology=climatology,
             trends={metric:trend([(a['year'],a[metric]) for a in annual if a['eligible']]) for metric in ('mean','min','max')})
    return result

if __name__=='__main__':
    result=build(ROOT/'data/history-ana.csv')
    (ROOT/'data'/'statistics.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n',encoding='utf-8')
    for name,s in result['stations'].items(): print(name,s['n'],'observações;',s['missing'],'dias ausentes;',s['trends']['mean']['n'],'anos elegíveis')
