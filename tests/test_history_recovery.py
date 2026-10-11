import unittest,sys,pathlib,tarfile,json,hashlib,csv
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from recover_history import parse_history,STATIONS
class RecoveryTests(unittest.TestCase):
 def test_every_output_value_reproduces_from_archived_official_xml(self):
  with (ROOT/'data/history-ana.csv').open() as stream:rows=list(csv.DictReader(stream))
  meta=json.loads((ROOT/'data/history-provenance.json').read_text())
  with tarfile.open(ROOT/'data/snapshots/ana-history-2026-10-11.tar.gz') as tar:
   for name,code in STATIONS.items():
    body=tar.extractfile(code+'.xml').read();self.assertEqual(hashlib.sha256(body).hexdigest(),meta['stations'][name]['sha256'])
    recovered,excluded=parse_history(body,code);actual=[r for r in rows if r['station']==name]
    self.assertEqual(len(actual),len(recovered))
    self.assertEqual([(r['date_str'],float(r['cota_m'])) for r in actual],[(r['date_str'],r['cota_m']) for r in recovered])
    self.assertEqual(excluded,meta['stations'][name]['excluded_status'])
  self.assertEqual(hashlib.sha256((ROOT/'rio_paraguai_estacoes_cota_diaria.csv').read_bytes()).hexdigest(),meta['legacy_sha256'])
 def test_no_averaging_daily_mean_with_timed_values_no_infill(self):
  template='<SerieHistorica><EstacaoCodigo>1</EstacaoCodigo><NivelConsistencia>1</NivelConsistencia><MediaDiaria>{mean}</MediaDiaria><DataHora>2025-10-01 {time}</DataHora><Cota01>{v}</Cota01><Cota02>0</Cota02><Cota03>100</Cota03><Cota03Status>2</Cota03Status></SerieHistorica>'
  body=('<DataTable>'+template.format(mean=1,time='00:00:00',v=130)+template.format(mean=0,time='07:00:00',v=120)+template.format(mean=0,time='17:00:00',v=140)+'</DataTable>').encode()
  rows,excluded=parse_history(body,'1');self.assertEqual([r['cota_m'] for r in rows],[1.3,0]);self.assertEqual(excluded,{'2':1});self.assertEqual(rows[-1]['date_str'],'2025-10-02')
