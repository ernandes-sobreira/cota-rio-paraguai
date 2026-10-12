"""Offline regressions for collection status, evidence, and delayed imports.

Every test writes only below TemporaryDirectory. Network access and sleeps are
mocked, and the clock is fixed so the results do not age with production data.
"""
import copy
import csv
import hashlib
import io
import json
import sys
import tempfile
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import import_verified
import update_data


TODAY = date(2026, 10, 12)
NOW = datetime(2026, 10, 12, 20, 0, tzinfo=timezone.utc)
NAMES = list(update_data.STATIONS.values())


class FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW.astimezone(tz) if tz else NOW.replace(tzinfo=None)


def rows(day='12/10/2026', level='1,15 M;'):
    return [[day, name, level, '+0,01 M;', 'Fonte oficial'] for name in NAMES]


def table(day='12/10/2026', level='1,15 M;'):
    return '<table>' + ''.join(
        '<tr>' + ''.join('<td>' + cell + '</td>' for cell in row) + '</tr>'
        for row in rows(day, level)
    ) + '</table>'


def snapshot(hour, day='12/10/2026', level='1,15 M;'):
    return dict(source_url=update_data.SOURCE,
                retrieved_at=f'2026-10-12T{hour:02d}:00:00+00:00',
                retrieval_method='verified_public_web', rows=rows(day, level))


class CollectionHealthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / 'data'
        self.data.mkdir()
        for target, value in [(update_data, self.root)]:
            patcher = patch.object(target, 'ROOT', value)
            patcher.start()
            self.addCleanup(patcher.stop)
        for module in (update_data, import_verified):
            patcher = patch.object(module, 'datetime', FixedDatetime)
            patcher.start()
            self.addCleanup(patcher.stop)
        # An accidentally introduced request fails locally instead of reaching
        # the official service. Each collector test configures this same mock.
        patcher = patch.object(update_data.urllib.request, 'urlopen',
                               side_effect=AssertionError('Unexpected network request'))
        self.urlopen = patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch.object(update_data.time, 'sleep')
        self.sleep = patcher.start()
        self.addCleanup(patcher.stop)

    def read(self, filename):
        return json.loads((self.data / filename).read_text(encoding='utf-8'))

    def seed(self, day='12/10/2026', failure=False):
        body = table(day).encode()
        records = update_data.parse_html(body.decode(), TODAY)
        stamp = '2026-10-12T14:00:00+00:00'
        for record in records:
            record.update(collected_at=stamp, source_sha256=hashlib.sha256(body).hexdigest(),
                          collection_method='direct_official_html')
        status = dict(schema_version=2, source_url=update_data.SOURCE,
                      checked_at=stamp, last_success_at=stamp,
                      last_direct_attempt_at=stamp, direct_status='ok',
                      fetch_status='ok', stations=records, error=None)
        if failure:
            status.update(checked_at='2026-10-12T18:00:00+00:00',
                          last_direct_attempt_at='2026-10-12T18:00:00+00:00',
                          direct_status='unavailable', fetch_status='error',
                          error='HTTPError: HTTP Error 403: Forbidden')
        update_data.dump(self.data / 'latest.json', status)
        update_data.dump(self.data / 'daily.json', records)
        stream = io.StringIO(newline='')
        writer = csv.writer(stream, lineterminator='\n')
        writer.writerow(['station', 'date', 'cota_m', 'variacao_publicada_m',
                         'source_url', 'collected_at', 'observation'])
        for r in records:
            writer.writerow([r['station'], r['date'], r['level_m'], r['variation_m'],
                             r['source_url'], r['collected_at'], r['observation']])
        (self.data / 'daily.csv').write_text(stream.getvalue(), encoding='utf-8')
        return status

    def collect(self, body=None, error=None):
        self.urlopen.side_effect = error
        if body is not None:
            response = MagicMock()
            response.__enter__.return_value = response
            response.read.return_value = body.encode()
            self.urlopen.return_value = response
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            return update_data.main([])

    def assert_failed_preserving_records(self, original, before):
        latest = self.read('latest.json')
        self.assertEqual(latest['fetch_status'], 'error')
        self.assertEqual(latest['direct_status'], 'unavailable')
        self.assertEqual(latest['last_success_at'], original['last_success_at'])
        self.assertEqual(latest['stations'], original['stations'])
        self.assertEqual(latest['checked_at'], NOW.isoformat(timespec='seconds'))
        self.assertEqual(latest['last_direct_attempt_at'], latest['checked_at'])
        self.assertTrue(latest['error'])
        for name, content in before.items():
            self.assertEqual((self.data / name).read_bytes(), content, name)

    def archive_bytes(self):
        return {name: (self.data / name).read_bytes() for name in ('daily.json', 'daily.csv')}

    def test_403_fails_once_and_preserves_readings_success_and_archives(self):
        original = self.seed()
        before = self.archive_bytes()
        error = urllib.error.HTTPError(update_data.SOURCE, 403, 'Forbidden', {}, None)
        self.assertEqual(self.collect(error=error), 1)
        self.assertEqual(self.urlopen.call_count, 1)
        self.sleep.assert_not_called()
        self.assert_failed_preserving_records(original, before)

    def test_timeout_retries_three_times_then_fails_without_data_loss(self):
        original = self.seed()
        before = self.archive_bytes()
        self.assertEqual(self.collect(error=TimeoutError('timed out')), 1)
        self.assertEqual(self.urlopen.call_count, 3)
        self.assertEqual(self.sleep.call_count, 2)
        self.assert_failed_preserving_records(original, before)

    def test_invalid_html_does_not_count_as_success(self):
        original = self.seed()
        before = self.archive_bytes()
        self.assertEqual(self.collect(body='<html>Service unavailable</html>'), 1)
        self.assertEqual(self.urlopen.call_count, 1)
        self.assert_failed_preserving_records(original, before)

    def test_older_official_table_cannot_verify_latest_readings(self):
        original = self.seed(day='11/10/2026')
        before = self.archive_bytes()
        self.assertEqual(self.collect(body=table(day='10/10/2026')), 1)
        self.assertEqual(self.urlopen.call_count, 1)
        self.assert_failed_preserving_records(original, before)

    def test_same_observation_preserves_collection_time_and_original_hash(self):
        original = self.seed()
        self.assertEqual(self.collect(body=table() + '<!-- refreshed layout -->'), 0)
        latest = self.read('latest.json')
        self.assertEqual(latest['stations'], original['stations'])
        self.assertEqual(self.read('daily.json'), sorted(original['stations'],
                                                       key=lambda r: (r['date'], r['station'])))
        self.assertEqual(latest['last_success_at'], NOW.isoformat(timespec='seconds'))
        self.assertEqual(latest['observation_status'], 'current')
        self.assertEqual(latest['stale_stations'], [])
        current_snapshot = self.read('snapshots/2026-10-12.json')
        self.assertNotEqual(current_snapshot['sha256'], latest['stations'][0]['source_sha256'])

    def test_freshness_requires_today_for_every_station(self):
        current = update_data.parse_html(table(), TODAY)
        self.assertEqual(update_data.freshness(current, TODAY),
                         dict(observation_status='current', stale_stations=[]))
        old = copy.deepcopy(current)
        old[0]['date'] = '2026-10-11'
        for records in (old, current[1:]):
            with self.subTest(records=records):
                health = update_data.freshness(records, TODAY)
                self.assertEqual(health['observation_status'], 'stale')
                self.assertEqual(health['stale_stations'], [NAMES[0]])
        self.assertEqual(update_data.freshness([], TODAY)['stale_stations'], NAMES)

    def test_delayed_verified_import_cannot_clear_a_more_recent_failure(self):
        original = self.seed(failure=True)
        result = import_verified.import_snapshot(snapshot(16), self.data)
        for key in ('checked_at', 'last_success_at', 'last_direct_attempt_at',
                    'direct_status', 'fetch_status', 'error', 'stations'):
            self.assertEqual(result[key], original[key], key)
        self.urlopen.assert_not_called()

    def test_new_historical_recovery_does_not_certify_current_observations(self):
        original = self.seed(failure=True)
        result = import_verified.import_snapshot(snapshot(19, day='10/10/2026'), self.data)
        for key in ('checked_at', 'last_success_at', 'fetch_status', 'error', 'stations'):
            self.assertEqual(result[key], original[key], key)
        archive = self.read('daily.json')
        self.assertEqual(len(archive), 6)
        self.assertEqual({r['date'] for r in archive}, {'2026-10-10', '2026-10-12'})
        self.assertNotIn('last_verified_web_at', result)

    def test_late_snapshot_cannot_overwrite_correction_time_or_newer_evidence(self):
        import_verified.import_snapshot(snapshot(14), self.data)
        corrected = import_verified.import_snapshot(snapshot(18, level='1,16 M;'), self.data)
        before = self.archive_bytes()
        saved = (self.data / 'snapshots/2026-10-12-verified.json').read_bytes()
        result = import_verified.import_snapshot(snapshot(17), self.data)
        self.assertEqual(result, corrected)
        self.assertEqual(self.archive_bytes(), before)
        self.assertEqual((self.data / 'snapshots/2026-10-12-verified.json').read_bytes(), saved)

    def test_reconfirmation_watermark_survives_old_timestamp_on_unchanged_reading(self):
        import_verified.import_snapshot(snapshot(14), self.data)
        corrected = import_verified.import_snapshot(snapshot(16, level='1,16 M;'), self.data)
        confirmed = import_verified.import_snapshot(snapshot(18, level='1,16 M;'), self.data)
        self.assertEqual(confirmed['stations'], corrected['stations'])
        self.assertEqual(confirmed['last_success_at'], snapshot(18)['retrieved_at'])
        result = import_verified.import_snapshot(snapshot(17), self.data)
        self.assertEqual(result, confirmed)
        self.assertTrue(all(r['level_m'] == 1.16 for r in result['stations']))
        self.assertTrue(all(r['collected_at'] == snapshot(16)['retrieved_at']
                            for r in result['stations']))
        self.assertEqual(self.read('snapshots/2026-10-12-verified.json'),
                         snapshot(18, level='1,16 M;'))
        self.assertTrue(all(r['level_m'] == 1.16 for r in self.read('daily.json')))

    def test_malformed_snapshot_rows_are_rejected_before_writing(self):
        self.seed()
        valid_rows = rows()
        non_string = copy.deepcopy(valid_rows)
        non_string[0][2] = 1.15
        malformed = [[], valid_rows[:2], [row[:4] for row in valid_rows],
                     [row + ['unexpected'] for row in valid_rows], non_string,
                     [valid_rows[0], valid_rows[0], valid_rows[2]]]
        before = {p.relative_to(self.data): p.read_bytes() for p in self.data.rglob('*') if p.is_file()}
        for bad_rows in malformed:
            with self.subTest(rows=bad_rows):
                value = snapshot(19)
                value['rows'] = bad_rows
                with self.assertRaises(ValueError):
                    import_verified.import_snapshot(value, self.data)
                after = {p.relative_to(self.data): p.read_bytes() for p in self.data.rglob('*') if p.is_file()}
                self.assertEqual(after, before)


if __name__ == '__main__':
    unittest.main()
