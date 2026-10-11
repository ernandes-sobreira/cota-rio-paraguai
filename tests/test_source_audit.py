import copy,csv,json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from recover_marinha import parse_snapshot
from build_source_audit import compare,timed_readings

class SourceAuditTests(unittest.TestCase):
 def test_all_published_rows_reproduce_from_official_text(self):
  recovered=[]
  for path in sorted((ROOT/'data/snapshots').glob('marinha-*-2025-web.json')):
   snapshot=json.loads(path.read_text());rows=parse_snapshot(snapshot);recovered+=rows
   broken=copy.deepcopy(snapshot);broken['extracted_text']=broken['extracted_text'].replace('L46@P1: 11 ','L46@P1: 11 9,99 ',1) if snapshot['pdf_page']==2 else broken['extracted_text'].replace('L11@P0: 11 ','L11@P0: 11 9,99 ',1)
   with self.assertRaises(ValueError):parse_snapshot(broken)
  published=json.loads((ROOT/'data/history-marinha.json').read_text())
  self.assertEqual(recovered,published['observations']);self.assertEqual(len(recovered),1017)
 def test_exact_date_pairs_and_timed_reference(self):
  marine=json.loads((ROOT/'data/history-marinha.json').read_text())
  with (ROOT/'data/history-ana.csv').open() as f:ana=list(csv.DictReader(f))
  summary,pairs=compare(marine,ana,timed_readings())
  self.assertEqual(summary,json.loads((ROOT/'data/source-audit.json').read_text()))
  self.assertEqual(len(pairs),1014)
  sample={r['station']:r for r in pairs if r['date']=='2025-10-11'}
  self.assertEqual(sample['Ladário']['marinha_m'],1.28)
  self.assertEqual(sample['Ladário']['ana_daily_mean_m'],1.245)
  self.assertEqual(sample['Ladário']['ana_07h_m'],1.27)
  self.assertEqual(sample['Ladário']['ana_17h_m'],1.22)
  self.assertEqual(sample['Porto Murtinho']['difference_cm'],.5)

if __name__=='__main__':unittest.main()
