const test=require('node:test');
const assert=require('node:assert/strict');
const calibration=require('../src/scripts/growth-calibration.js');
const add=(date,n)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);
const row=(i,extra={})=>({id:`r${i}`,cropId:`c${i}`,groupId:`g${i}`,asOf:add('2025-01-01',i*5),
  outcomeDate:add('2025-01-01',i*5+3),availableAt:add('2025-01-01',i*5+4),building:2,
  readyError:i%3-1,ordinalError:0,intervalHit:1,confidence:'reference',modelVersion:'v1',provenanceVerified:true,...extra});
test('calibration separates sample support from demonstrated chronological interval performance',()=>{
  const report=calibration.build({rows:Array.from({length:50},(_,i)=>row(i)),asOf:'2026-01-01'});
  assert.equal(report.all.interval.status,'validated-reference');
  assert.equal(report.all.interval.applied,false);
  assert.equal(report.all.interval.highEligible,false);
  assert.equal(report.all.interval.calibrationCrops,20);
  assert.equal(report.all.interval.validationCrops,30);
  assert.equal(report.all.metrics.quality.uneven.accuracy.value,null);
  assert.equal(report.recent.metrics.predictions,0,'recent window anchored to now, not latest stale outcome');
});
test('future and unavailable outcomes cannot enter calibration and null is never zero',()=>{
  const result=calibration.build({asOf:'2025-03-01',rows:[row(0,{readyError:null,ordinalError:null,intervalHit:null}),
    row(1,{availableAt:'2025-04-01'}),row(20),row(2,{availableAt:'invalid'})]});
  assert.equal(result.all.metrics.predictions,1);
  assert.equal(result.all.metrics.readyMAE.value,null);
  assert.equal(result.all.metrics.sizeAccuracy.value,null);
  assert.equal(result.excluded.unavailable,2);
});
test('crop and shared outcome components never multiply independent support',()=>{
  const rows=[row(0),row(1,{cropId:'c0'}),row(2,{groupId:'g1'})];
  const result=calibration.build({rows:[...rows,...rows],asOf:'2026-01-01'});
  assert.equal(result.all.metrics.independentCrops,1);
  assert.equal(result.excluded.duplicate,3);
  assert.equal(result.all.interval.status,'insufficient-data');
});
test('different frozen generations are not pooled to manufacture calibration support',()=>{
  const rows=Array.from({length:50},(_,i)=>row(i,{modelVersion:i<25?'v1':'v2'}));
  const result=calibration.build({rows,asOf:'2026-01-01'});
  assert.equal(result.all.interval.status,'mixed-generations');
  assert.equal(result.generations.v1.interval.status,'insufficient-data');
  assert.equal(result.generations.v2.interval.status,'insufficient-data');
});
test('unproven historical entry times remain descriptive and cannot calibrate a production interval',()=>{
  const rows=Array.from({length:60},(_,i)=>row(i,{provenanceVerified:false}));
  const result=calibration.build({rows,asOf:'2026-01-01'});
  assert.equal(result.all.metrics.readyMAE.independentCrops,60);
  assert.equal(result.all.interval.independentCrops,0);
  assert.equal(result.all.interval.status,'insufficient-data');
});
test('late-entered calibration results cannot cross the validation forecast origin',()=>{
  const rows=Array.from({length:40},(_,i)=>row(i,{availableAt:'2025-12-01'}));
  const result=calibration.build({rows,asOf:'2026-01-01'});
  assert.equal(result.all.interval.status,'insufficient-data');
});
test('bad future performance fails the held-out coverage check despite large training support',()=>{
  const rows=Array.from({length:50},(_,i)=>row(i,{readyError:i<20?0:10,intervalHit:0}));
  const result=calibration.build({rows,asOf:'2026-01-01'});
  assert.equal(result.all.interval.status,'validation-failed');
  assert.equal(result.all.interval.validationCoverage,0);
});
test('case errors have their own units and quality metrics keep unknown separate',()=>{
  const result=calibration.build({rows:[row(0,{qualityErrors:{elongated:1,uneven:0,tipburn:null}})],
    caseRows:[row(1,{error:-2,intervalHit:0})],asOf:'2026-01-01'});
  assert.equal(result.all.metrics.cases.mae.value,2);
  assert.equal(result.all.metrics.cases.bias.value,-2);
  assert.equal(result.all.metrics.cases.coverage.value,0);
  assert.equal(result.all.metrics.quality.elongated.mae.value,1);
  assert.equal(result.all.metrics.quality.tipburn.mae.value,null);
});
