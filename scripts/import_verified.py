"""Import an explicitly retrieved official table; never synthesize observations.

Input JSON: {source_url, retrieved_at, retrieval_method: 'verified_public_web',
rows: [[date_dd/mm/yyyy, station, level_string, variation_string, observation], ...]}
This path records the hash of the extracted snapshot, not an invented HTML hash.
"""
import argparse
import csv
import hashlib
import html
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from update_data import ROOT, SOURCE, STATIONS, dump, merge_records, parse_html, freshness

def import_snapshot(snapshot, data_dir):
    if snapshot['source_url'] != SOURCE or snapshot['retrieval_method'] != 'verified_public_web':
        raise ValueError('Somente a tabela oficial CHN-6 pode ser importada por este caminho.')
    if len(snapshot['rows']) != 3 or any(len(row) != 5 or any(not isinstance(cell, str) for cell in row) for row in snapshot['rows']):
        raise ValueError('Snapshot deve conter exatamente três linhas de cinco células em texto.')
    retrieved = datetime.fromisoformat(snapshot['retrieved_at'])
    if retrieved.tzinfo is None or retrieved > datetime.now(timezone.utc):
        raise ValueError('Horário de recuperação inválido.')
    markup = '<table>'+''.join('<tr>'+''.join('<td>'+html.escape(str(c))+'</td>' for c in row)+'</tr>' for row in snapshot['rows'])+'</table>'
    records = parse_html(markup, retrieved.astimezone(__import__('zoneinfo').ZoneInfo('America/Campo_Grande')).date())
    digest = hashlib.sha256(json.dumps(snapshot,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
    for r in records:
        r.update(collected_at=snapshot['retrieved_at'],collection_method='verified_public_web',snapshot_sha256=digest)
    archive_path=data_dir/'daily.json'; latest_path=data_dir/'latest.json'
    old=json.loads(archive_path.read_text()) if archive_path.exists() else []
    previous=json.loads(latest_path.read_text()) if latest_path.exists() else {}
    last_success = datetime.fromisoformat(previous['last_success_at']) if previous.get('last_success_at') else None
    observed = {r['station']: dict(r) for r in records}
    old_by_key={(r['station'],r['date']):r for r in old}
    for i,r in enumerate(records):
        prior=old_by_key.get((r['station'],r['date']))
        if prior and ((last_success is not None and retrieved < last_success) or datetime.fromisoformat(prior['collected_at']) > retrieved or all(prior.get(k)==r.get(k) for k in ('level_m','variation_m','observation','raw_cells'))):
            records[i]=prior
    merged=merge_records(old,records)
    # An old indexed source can never roll the latest station reading backwards.
    latest=[max((r for r in merged if r['station']==s),key=lambda r:r['date']) for s in STATIONS.values()]
    # Historical or delayed imports may add evidence, but cannot clear a newer failure
    # or claim verification of observations absent from the retrieved table.
    last_check = datetime.fromisoformat(previous['checked_at']) if previous.get('checked_at') else None
    verifies_latest = all(all(observed[r['station']].get(k) == r.get(k) for k in ('date','level_m','variation_m','observation','raw_cells')) for r in latest)
    previous.update(schema_version=2, source_url=SOURCE, stations=latest,
                    timezone='America/Campo_Grande', schedule_local=['07:20','08:20','10:20','14:20'],
                    **freshness(latest))
    if verifies_latest and (last_check is None or retrieved >= last_check):
        previous.update(checked_at=snapshot['retrieved_at'], last_success_at=snapshot['retrieved_at'],
                        last_verified_web_at=snapshot['retrieved_at'], fetch_status='verified_web', error=None)
    dump(archive_path,merged);dump(latest_path,previous)
    snapshot_path = data_dir/'snapshots'/(snapshot['retrieved_at'][:10]+'-verified.json')
    saved = json.loads(snapshot_path.read_text()) if snapshot_path.exists() else None
    if saved is None or datetime.fromisoformat(saved['retrieved_at']) <= retrieved:
        dump(snapshot_path,snapshot)
    stream=io.StringIO(newline='');w=csv.writer(stream,lineterminator="\n")
    w.writerow(['station','date','cota_m','variacao_publicada_m','source_url','collected_at','observation'])
    for r in merged:w.writerow([r['station'],r['date'],r['level_m'],'' if r['variation_m'] is None else r['variation_m'],r['source_url'],r['collected_at'],r['observation']])
    (data_dir/'daily.csv').write_text(stream.getvalue(),encoding='utf-8')
    return previous

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('snapshot',type=Path);args=ap.parse_args()
    result=import_snapshot(json.loads(args.snapshot.read_text()),ROOT/'data')
    print('Tabela oficial importada:',[(r['station'],r['date'],r['level_m']) for r in result['stations']])
