import sys
import unittest
import tempfile
from datetime import datetime, timezone
from datetime import date
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from update_data import parse_html, merge_records, number
from build_stats import quantile, trend
from import_verified import import_snapshot

def table(day='11/10/2026', level='1,15 M;', variation='+ 0,08 M;'):
    return '<table>'+''.join(f'<tr><td>{day}</td><td><b>{s}</b></td><td>{level}</td><td>{variation}</td><td>Fonte: Marinha<br>Observação</td></tr>' for s in ['Cáceres','Ladário','Porto Murtinho'])+'</table>'

class CollectorTests(unittest.TestCase):
    def test_official_format_and_negative_levels(self):
        rows=parse_html(table(level='−0,29 M;', variation='- 0,02 M'),date(2026,10,11))
        self.assertEqual(rows[0]['level_m'],-.29);self.assertEqual(rows[0]['variation_m'],-.02)
        self.assertIsNone(rows[0]['measurement_time']);self.assertEqual(rows[0]['date'],'2026-10-11')
    def test_missing_variation_is_not_zero(self):
        self.assertIsNone(parse_html(table(variation=''),date(2026,10,11))[0]['variation_m'])
    def test_reject_structure_change(self):
        with self.assertRaises(ValueError):parse_html('<html>Indisponível</html>')
    def test_reject_future(self):
        with self.assertRaises(ValueError):parse_html(table(),date(2026,10,10))
    def test_invalid_level(self):
        with self.assertRaises(ValueError):parse_html(table(level='indisponível'),date(2026,10,11))
    def test_merge_keeps_gap_and_accepts_correction(self):
        old=[dict(station='Cáceres',date='2026-10-09',level_m=1)]
        new=[dict(station='Cáceres',date='2026-10-11',level_m=1.15)]
        merged=merge_records(old,new);self.assertEqual(len(merged),2)
        self.assertEqual(merge_records(merged,[dict(new[0],level_m=1.16)])[-1]['level_m'],1.16)
        self.assertEqual(merge_records(merged,new),merged)

class StatsTests(unittest.TestCase):
    def test_quantile_type7(self):
        self.assertAlmostEqual(quantile([1,2,3,4],.1),1.3)
    def test_known_linear_trend(self):
        t=trend([(2000+i,2+.02*i) for i in range(20)])
        self.assertAlmostEqual(t['slope_m_year'],.02);self.assertAlmostEqual(t['sen_m_year'],.02);self.assertAlmostEqual(t['r2'],1)
    def test_flat_series_and_insufficient_data(self):
        t=trend([(2000+i,1) for i in range(10)])
        self.assertEqual(t['mk_p_uncorrected'],1);self.assertIsNone(t['r2'])
        self.assertIsNone(trend([(2000,1)]))

class VerifiedImportTests(unittest.TestCase):
    def test_verified_roundtrip_and_old_snapshot(self):
        snapshot=dict(source_url='https://www.marinha.mil.br/chn-6/',retrieved_at=datetime.now(timezone.utc).isoformat(),retrieval_method='verified_public_web',rows=[['11/10/2026',s,'1,15 M;','', 'Fonte pública'] for s in ['Cáceres','Ladário','Porto Murtinho']])
        with tempfile.TemporaryDirectory() as tmp:
            result=import_snapshot(snapshot,Path(tmp))
            self.assertEqual(result['stations'][0]['level_m'],1.15)
            self.assertIsNone(result['stations'][0]['variation_m'])
            self.assertEqual(result['stations'][0]['collection_method'],'verified_public_web')
            self.assertNotIn('source_sha256',result['stations'][0])
            for r in snapshot['rows']:r[0]='10/10/2026';r[2]='1,00 M;'
            result=import_snapshot(snapshot,Path(tmp))
            self.assertTrue(all(r['date']=='2026-10-11' for r in result['stations']))

if __name__=='__main__':unittest.main()
