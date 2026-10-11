#!/usr/bin/env python3
"""Aggregate published ANA observations; no imputation and no fusion with Marinha.

Usage: python scripts/update_telemetry.py --output data/telemetry-daily-2026.json
Use --offline --cache-dir DIR to reproduce from saved XML snapshots.
Use --recent for rolling 40-day refresh while preserving older aggregated dates.
The legacy public endpoint may disappear; a failed fetch never erases older days.
"""
import argparse,calendar,collections,concurrent.futures,csv,datetime,hashlib,json,math,pathlib,statistics,urllib.parse,urllib.request,xml.etree.ElementTree as ET
STATIONS={'Cáceres':'66070004','Ladário':'66825000','Porto Murtinho':'67100000'}
ENDPOINT='https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos'
SOURCE_NOTE='Horários originais do XML. A resposta não declara fuso; os dias são agrupados pela data publicada, sem conversão.'

def parse_xml(content,code):
    output={};blank=invalid=duplicates=0
    root=ET.fromstring(content)
    if root.tag.split('}')[-1]!='DataTable':raise ValueError('Resposta não é uma tabela ANA')
    for node in root.iter('DadosHidrometereologicos'):
        row={c.tag:(c.text or '').strip() for c in node}
        if row.get('CodEstacao')!=code:raise ValueError('Código de estação divergente')
        if not row.get('Nivel'):blank+=1;continue
        try:
            val=float(row['Nivel'].replace(',','.'))
            stamp=datetime.datetime.strptime(row['DataHora'],'%Y-%m-%d %H:%M:%S')
            if not math.isfinite(val) or val in (-999.1,-999.2,-9999):raise ValueError('sentinel')
        except (ValueError,KeyError):invalid+=1;continue
        key=stamp.isoformat()
        if key in output:
            duplicates+=1
            if output[key]!=val/100:raise ValueError('Valores conflitantes no mesmo timestamp')
        output[key]=val/100
    return output,{'blank_levels':blank,'invalid_levels':invalid,'duplicate_timestamps':duplicates}

def summarize(observations,source_id,source_url,today):
    groups=collections.defaultdict(list)
    for stamp,val in sorted(observations.items()):groups[stamp[:10]].append((stamp,val))
    daily=[]
    for day,obs in sorted(groups.items()):
        vals=[v for t,v in obs];n=len(vals);times=[t[11:] for t,v in obs]
        if n==1:freq='single_reading'
        elif n==2 and times==['07:00:00','17:00:00']:freq='twice_daily_07_17'
        elif n>=72:freq='subdaily'
        else:freq='limited_subdaily'
        daily.append(dict(date=day,mean=round(statistics.mean(vals),6),min=round(min(vals),6),max=round(max(vals),6),sd=round(statistics.stdev(vals),6) if n>1 else None,n=n,first_timestamp=obs[0][0],last_timestamp=obs[-1][0],source_id=source_id,source_url=source_url,frequency=freq,partial_day=day==today.isoformat(),quality='provisional_observations'))
    return daily

def fetch_month(item,cache,offline,end):
    name,code,year,month=item
    a=datetime.date(year,month,1);b=min(datetime.date(year,month,calendar.monthrange(year,month)[1]),end)
    url=ENDPOINT+'?'+urllib.parse.urlencode(dict(codEstacao=code,dataInicio=a.strftime('%d/%m/%Y'),dataFim=b.strftime('%d/%m/%Y')))
    path=cache/f'{code}-{year}-{month:02d}.xml';key=f'ana-{code}-{year}-{month:02d}'
    try:
        if offline:content=path.read_bytes()
        else:
            request=urllib.request.Request(url,headers={'User-Agent':'CotaRioParaguai/2.2 public hydrology dashboard'})
            with urllib.request.urlopen(request,timeout=50) as response:content=response.read()
        obs,quality=parse_xml(content,code)
        # Date-only scope uses the source's published calendar. Today is retained as partial.
        obs={t:v for t,v in obs.items() if a.isoformat()<=t[:10]<=b.isoformat()}
        if not offline:path.write_bytes(content)
        digest=hashlib.sha256(content).hexdigest();key=f'{key}-{digest[:16]}'
        retrieved=datetime.datetime.now(datetime.timezone.utc).isoformat()
        manifest_path=cache.parent/'ana-manifest.json'
        if offline and manifest_path.exists():
            manifest=json.loads(manifest_path.read_text())
            hit=next((x for x in manifest if x.get('sha256')==digest),None)
            if hit:retrieved=hit['retrieved_at']
        source=dict(url=url,sha256=digest,retrieved_at=retrieved,station_code=code,range_start=a.isoformat(),range_end=b.isoformat(),**quality)
        today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4))).date()
        return name,key,source,summarize(obs,key,url,today),None
    except Exception as exc:return name,key,None,[],f'{type(exc).__name__}: {exc}'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--year',type=int,default=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4))).year)
    parser.add_argument('--end',type=datetime.date.fromisoformat)
    parser.add_argument('--output',type=pathlib.Path)
    parser.add_argument('--csv',type=pathlib.Path)
    parser.add_argument('--cache-dir',type=pathlib.Path,default=pathlib.Path('.cache/ana-telemetry'))
    parser.add_argument('--offline',action='store_true');parser.add_argument('--recent',action='store_true')
    args=parser.parse_args();today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4))).date()
    end=min(args.end or today,today,datetime.date(args.year,12,31));start=datetime.date(args.year,1,1)
    if end<start:raise SystemExit('O ano solicitado está no futuro')
    if args.output is None:args.output=pathlib.Path(f'data/telemetry-daily-{args.year}.json')
    args.cache_dir.mkdir(parents=True,exist_ok=True)
    previous=json.loads(args.output.read_text()) if args.output.exists() else {}
    if previous.get('year')!=args.year:previous={}
    sources=previous.get('sources',{}).copy();daily_by_station={n:{d['date']:d for d in previous.get('stations',{}).get(n,{}).get('daily',[]) if d['date']<=end.isoformat()} for n in STATIONS}
    first_month=max(start,end-datetime.timedelta(days=40)).month if args.recent and previous else 1
    queries=[(n,c,args.year,m) for n,c in STATIONS.items() for m in range(first_month,end.month+1)]
    errors=[];success=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for name,key,source,rows,error in pool.map(lambda item:fetch_month(item,args.cache_dir,args.offline,end),queries):
            if error:errors.append({'source_id':key,'error':error});continue
            success+=1;sources[key]=source
            # Blank or unavailable days do not delete previously acquired observations.
            for row in rows:daily_by_station[name][row['date']]=row
    if success==0:raise SystemExit('Nenhuma consulta bem-sucedida; arquivo anterior preservado')
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    result=dict(schema_version=1,year=args.year,fetched_at=now,source_url=ENDPOINT,source='ANA · serviço público de dados hidrometeorológicos',unit='m',original_unit='cm',timestamp_timezone=None,timestamp_note=SOURCE_NOTE,aggregation='Média aritmética dos registros de nível disponíveis por data publicada; mínimo, máximo e desvio-padrão amostral intradiários. Frequência variável. Não é média de 24 horas garantida; não há interpolação.',legacy_service_notice='A ANA anuncia migração do serviço legado para HidroWebService. Disponibilidade futura não garantida; falhas preservam os dados anteriores.',status='partial_error' if errors else 'ok',errors=errors,stations={},sources=sources)
    for name,code in STATIONS.items():
        daily=sorted(daily_by_station[name].values(),key=lambda d:d['date']);dates={d['date'] for d in daily};expected=(end-start).days+1;missing=[(start+datetime.timedelta(days=i)).isoformat() for i in range(expected) if (start+datetime.timedelta(days=i)).isoformat() not in dates]
        result['stations'][name]=dict(code=code,source_url=ENDPOINT,daily=daily,coverage=dict(days_with_data=len(daily),days_elapsed=expected,missing_days=len(missing),missing_dates=missing,start=daily[0]['date'] if daily else None,end=daily[-1]['date'] if daily else None,observation_count=sum(d['n'] for d in daily)),frequency_counts=dict(collections.Counter(d['frequency'] for d in daily)))
    used_sources={row['source_id'] for station in result['stations'].values() for row in station['daily']}
    result['sources']={k:v for k,v in result['sources'].items() if k in used_sources}
    args.output.parent.mkdir(parents=True,exist_ok=True);tmp=args.output.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n');tmp.replace(args.output)
    if args.csv:
        fields=['station','code','date','mean','min','max','sd','n','first_timestamp','last_timestamp','source_id','source_url','frequency','partial_day','quality']
        with args.csv.open('w',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
            for n,s in result['stations'].items():
                for d in s['daily']:writer.writerow(dict(station=n,code=s['code'],**d))
    print(json.dumps({n:s['coverage']|{'missing_dates':None} for n,s in result['stations'].items()},ensure_ascii=False))
if __name__=='__main__':main()
