import csv
import json
import statistics
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from build_overview import profile

class OverviewTests(unittest.TestCase):
    def test_calendar_days_do_not_shift_in_leap_years(self):
        rows=[dict(date_str=d,cota_m=str(v)) for d,v in [('2019-03-01',1),('2020-02-29',9),('2020-03-01',3)]]
        result=dict((r[0],r[1:]) for r in profile(rows))
        self.assertEqual(result['02-29'],[9,9,9,None,1])
        self.assertEqual(result['03-01'][:3],[1,3,2])
        self.assertAlmostEqual(result['03-01'][3],2**.5)
        self.assertEqual(result['03-01'][4],2)

    def test_every_profile_against_original_observations(self):
        groups={}
        with (ROOT/'data/history-ana.csv').open() as f:
            for r in csv.DictReader(f):
                if r['cota_m'].strip():groups.setdefault((r['station'],r['date_str'][5:]),[]).append(float(r['cota_m']))
        overview=json.loads((ROOT/'data/overview.json').read_text())
        for name,station in overview['stations'].items():
            self.assertEqual(sum(r[5] for r in station['profile']),station['n'])
            self.assertEqual(len(station['profile']),366)
            for day,lo,hi,mean,sd,n in station['profile']:
                values=groups[name,day]
                self.assertEqual(n,len(values))
                for got,expected in [(lo,min(values)),(hi,max(values)),(mean,statistics.mean(values)),(sd,statistics.stdev(values))]:
                    self.assertAlmostEqual(got,expected,places=5)

if __name__=='__main__':unittest.main()
