"""Recover published ANA daily means, keeping legacy input untouched.
No interpolation, no averaging monthly means with timed observations.
Only MediaDiaria=1; explicit day-status other than 1 excluded conservatively.
Missing status is preserved as unknown, not assumed quality-controlled.
"""
import argparse,calendar,collections,csv,datetime,hashlib,json,math,pathlib,tarfile,urllib.request,urllib.parse,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
STATIONS={'Cáceres':'66070004','Ladário':'66825000','Porto Murtinho':'67100000'}
ENDPOINT='https://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroSerieHistorica'
def parse_history(body,code):
 root=ET.fromstring(body)
 if root.tag.split('}')[-1]!='DataTable':raise ValueError('Resposta não é tabela ANA')
 result={};excluded=collections.Counter()
 for node in root.iter('SerieHistorica'):
  r={x.tag:(x.text or '').strip() for x in node}
  if r['EstacaoCodigo']!=code:raise ValueError('Estação incorreta')
  if r.get('NivelConsistencia')!='1':raise ValueError('Consistência inesperada')
  if r.get('MediaDiaria')!='1':continue
  stamp=datetime.datetime.strptime(r['DataHora'],'%Y-%m-%d %H:%M:%S')
  for day in range(1,calendar.monthrange(stamp.year,stamp.month)[1]+1):
   field=f'Cota{day:02}';raw=r.get(field,'');flag=r.get(field+'Status','')
   if not raw:continue
   if flag not in ('','1'):excluded[flag]+=1;continue
   value=float(raw.replace(',','.'))/100
   if not math.isfinite(value) or not -10<=value<=30:raise ValueError('Cota fora da faixa de validação')
   date=stamp.replace(day=day).date().isoformat()
   if not '1966-01-01'<=date<='2025-12-31':continue
   row={'date_str':date,'cota_m':value,'source_status':flag,'consistency':'1','daily_mean':'1'}
   if date in result and result[date]!=row:raise ValueError('Dia conflitante')
   result[date]=row
 return [result[k] for k in sorted(result)],dict(excluded)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--cache-dir',type=pathlib.Path,default=ROOT/'.cache/history-source');ap.add_argument('--offline',action='store_true');args=ap.parse_args();args.cache_dir.mkdir(parents=True,exist_ok=True)
 all_rows=[];manifest={'source_url':ENDPOINT,'period':['1966-01-01','2025-12-31'],'selection':'MediaDiaria=1; NivelConsistencia=1 (bruto conforme documentação atual do endpoint); status explícito diferente de 1 excluído. Status ausente mantido como desconhecido. Sem interpolação ou mistura com observações horárias.','stations':{}}
 legacy=list(csv.DictReader((ROOT/'rio_paraguai_estacoes_cota_diaria.csv').open()))
 for name,code in STATIONS.items():
  path=args.cache_dir/(code+'.xml');meta=args.cache_dir/(code+'.json')
  if not args.offline:
   url=ENDPOINT+'?'+urllib.parse.urlencode(dict(codEstacao=code,dataInicio='01/01/1966',dataFim='31/12/2025',tipoDados='1',nivelConsistencia='1'))
   body=urllib.request.urlopen(url,timeout=60).read();parse_history(body,code);path.write_bytes(body)
   meta.write_text(json.dumps(dict(url=url,sha256=hashlib.sha256(body).hexdigest(),retrieved_at=datetime.datetime.now(datetime.timezone.utc).isoformat())))
  body=path.read_bytes();source=json.loads(meta.read_text())
  if hashlib.sha256(body).hexdigest()!=source['sha256']:raise ValueError('Hash divergente')
  rows,excluded=parse_history(body,code);old={r['date_str']:float(r['cota_m']) for r in legacy if r['station']==name and r['cota_m'].strip()}
  source.update(code=code,n=len(rows),start=rows[0]['date_str'],end=rows[-1]['date_str'],excluded_status=excluded,unknown_status=sum(not r['source_status'] for r in rows),legacy_common=sum(r['date_str'] in old for r in rows),legacy_different=sum(r['date_str'] in old and abs(r['cota_m']-old[r['date_str']])>1e-6 for r in rows),previous_year_example=next(r for r in rows if r['date_str']=='2025-10-11'))
  manifest['stations'][name]=source
  all_rows.extend(dict(station=name,**r) for r in rows)
 fields=['station','date_str','cota_m','source_status','consistency','daily_mean']
 with (ROOT/'data/history-ana.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(all_rows)
 manifest['legacy_sha256']=hashlib.sha256((ROOT/'rio_paraguai_estacoes_cota_diaria.csv').read_bytes()).hexdigest()
 manifest['output_sha256']=hashlib.sha256((ROOT/'data/history-ana.csv').read_bytes()).hexdigest()
 (ROOT/'data/history-provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 with tarfile.open(ROOT/'data/snapshots/ana-history-2026-10-11.tar.gz','w:gz') as tar:
  for code in STATIONS.values():
   for ext in ['xml','json']:tar.add(args.cache_dir/(code+'.'+ext),arcname=code+'.'+ext)
 print(json.dumps({n:{k:s[k] for k in ['n','legacy_common','legacy_different','excluded_status']} for n,s in manifest['stations'].items()},ensure_ascii=False))
if __name__=='__main__':main()
