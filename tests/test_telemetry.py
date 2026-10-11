import unittest,sys,pathlib,datetime,json,math,tarfile,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from update_telemetry import parse_xml,summarize

class TelemetryTests(unittest.TestCase):
 def test_observed_statistics_and_absences(self):
  rows=summarize({'2026-01-01T07:00:00':1,'2026-01-01T17:00:00':3,'2026-01-03T07:00:00':2},'source','https://source',datetime.date(2026,1,3))
  self.assertEqual(len(rows),2);self.assertEqual(rows[0]['mean'],2);self.assertAlmostEqual(rows[0]['sd'],math.sqrt(2),places=5);self.assertIsNone(rows[1]['sd']);self.assertEqual(rows[0]['frequency'],'twice_daily_07_17');self.assertTrue(rows[1]['partial_day'])
 def test_null_and_sentinel_are_not_zero(self):
  body=b'<DataTable><DadosHidrometereologicos><CodEstacao>1</CodEstacao><DataHora>2026-01-01 00:00:00</DataHora><Nivel></Nivel></DadosHidrometereologicos><DadosHidrometereologicos><CodEstacao>1</CodEstacao><DataHora>2026-01-01 00:15:00</DataHora><Nivel>-999.1</Nivel></DadosHidrometereologicos></DataTable>'
  rows,q=parse_xml(body,'1');self.assertEqual(rows,{});self.assertEqual(q['blank_levels'],1);self.assertEqual(q['invalid_levels'],1)
 def test_reject_wrong_response(self):
  with self.assertRaises(ValueError):parse_xml(b'<html>indisponivel</html>','1')
 def test_all_initial_817_days_against_original_xml_snapshot(self):
  with tarfile.open(ROOT/'data/snapshots/ana-2026-10-11.tar.gz','r:gz') as tar:
   baseline=json.load(tar.extractfile('ana-daily-2026-10-11.json'));count=0
   for name,station in baseline['stations'].items():
    days={r['date']:r for r in station['daily']}
    for member in tar.getmembers():
     if not member.name.startswith('ana-xml/'+station['code']) or not member.name.endswith('.xml'):continue
     raw=tar.extractfile(member).read();values,q=parse_xml(raw,station['code'])
     with self.assertRaises(ValueError):parse_xml(raw,'wrong-code')
     for row in summarize(values,'source','url',datetime.date(2026,10,11)):
      expected=days[row['date']];count+=1
      for key in ['mean','min','max','sd','n','first_timestamp','last_timestamp','frequency','partial_day']:self.assertEqual(row[key],expected[key],(name,row['date'],key))
      self.assertEqual(baseline['sources'][expected['source_id']]['sha256'],hashlib.sha256(raw).hexdigest())
   self.assertEqual(count,817)
