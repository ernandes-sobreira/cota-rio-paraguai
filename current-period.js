import {describe, epoch, DAY} from './math.js';
// Telemetry stays separate from the historical ANA product. No gaps are filled.
export function currentPeriod(telemetry, historical, station, today, mode='year') {
 const end=new Date(epoch(today)-DAY).toISOString().slice(0,10);
 const year=today.slice(0,4), start=mode==='month'?today.slice(0,7)+'-01':year+'-01-01';
 const previousYear=String(Number(year)-1);
 const priorStart=previousYear+start.slice(4);
 let priorEnd=previousYear+end.slice(4);
 // Compare Feb 29 against Feb 28 in a non-leap previous year.
 if(priorEnd.endsWith('-02-29')&&new Date(priorEnd+'T12:00:00Z').getUTCMonth()!==1)priorEnd=previousYear+'-02-28';
 const all=(telemetry.stations?.[station]?.daily||[]).filter(r=>typeof r.mean==='number'&&Number.isFinite(r.mean)&&r.date<=today).sort((a,b)=>a.date.localeCompare(b.date));
 const rows=all.filter(r=>r.date>=start&&r.date<=end&&!r.partial_day).map(r=>({date:r.date,value:r.mean}));
 const valid=end>=start;
 const prior=valid?historical.filter(r=>r.station===station&&r.date>=priorStart&&r.date<=priorEnd):[];
 const current=describe(rows,start,valid?end:start),previous=describe(prior,priorStart,valid?priorEnd:priorStart);
 if(!valid){current.expected=0;previous.expected=0;}
 const comparable=valid&&current.n/current.expected>=.8&&previous.n/previous.expected>=.8;
 return {start,end,priorStart,priorEnd,current,previous,rows,latest:all.at(-1)?.date||null,delta:comparable?current.mean-previous.mean:null};
}
