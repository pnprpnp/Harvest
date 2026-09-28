"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const yieldModel = require("../src/scripts/growth-yield.js");
const planner = require("../src/scripts/growth-planner.js");
const evidence = require("../src/scripts/growth-evidence.js");
const add = (date,n) => new Date(Date.parse(date+"T00:00:00Z")+n*86400000).toISOString().slice(0,10);
const crop = (extra={}) => ({ eventId:1, plantingDate:"2025-01-01", plantingPalletKeys:["2-A-1","2-A-2"],
  plantingCountsByPallet:{"2-A-1":20,"2-A-2":20}, actualPlantedSeedlingCount:40,
  createdAt:"2025-01-01T09:00:00+09:00", updatedAt:"2025-01-01T09:00:00+09:00", ...extra });
const full = (extra={}) => ({ id:1, recordUuid:"full-1", type:"fullHarvest", date:"2025-02-01", cases:2,
  palletKeys:["2-A-1","2-A-2"], createdAt:"2025-02-01T12:00:00+09:00", updatedAt:"2025-02-01T12:00:00+09:00", ...extra });
const partial = (extra={}) => ({ id:2, recordUuid:"partial-1", type:"partialHarvest", date:"2025-01-20", cases:1,
  targets:[{building:2,bed:"A",start:1,end:2,plantsPerPallet:6}],
  createdAt:"2025-01-20T12:00:00+09:00", updatedAt:"2025-01-20T12:00:00+09:00", ...extra });
const asOf = "2025-02-02T12:00:00+09:00";

test("actual planting, partial cases and final cases reconcile once per completed crop",()=>{
  const records=[partial(),full()], plantingEvents=[crop()], before=JSON.stringify({records,plantingEvents});
  const data=yieldModel.buildDataset({records,plantingEvents,asOf});
  assert.equal(data.yieldRows.length,1);
  assert.equal(data.yieldRows[0].plantedHeads,40);
  assert.equal(data.yieldRows[0].partialHeads,12);
  assert.equal(data.yieldRows[0].cases,2);
  assert.equal(yieldModel.fit({planner,dataset:data}).model.rows[0].factor,0.9);
  assert.equal(JSON.stringify({records,plantingEvents}),before);
  assert.equal(yieldModel.currentInput(data,{palletKeys:["2-A-1"]}).valid,false);
});

test("remaining quantity uses an exact scope bucket and never allocates the partial average to positions",()=>{
  const data=yieldModel.buildDataset({records:[partial()],plantingEvents:[crop()],asOf:"2025-01-25T12:00:00+09:00"});
  const model=planner.fitYield([{id:"independent-earlier-crop",building:2,plantedHeads:40,cases:3}]);
  const prediction=yieldModel.predict({planner,model,dataset:data,palletKeys:["2-A-1","2-A-2"]});
  assert.equal(prediction.center,2);
  assert.equal(prediction.partialHeads,12);
  assert.equal(prediction.input.aggregation,"exact-scope-total-no-position-allocation");
  assert.equal(prediction.readinessEvaluated,false);
  const position=yieldModel.predict({planner,model,dataset:data,palletKeys:["2-A-1"]});
  assert.equal(position.center,null);
  assert.ok(position.reasons.includes("partialScopeCannotBeAllocated"));
});

test("unknown counts stay unknown; crop totals are usable only for the complete matching scope",()=>{
  const missing=crop({plantingCountsByPallet:{},actualPlantedSeedlingCount:undefined});
  assert.equal(yieldModel.buildDataset({records:[full()],plantingEvents:[missing],asOf}).yieldRows.length,0);
  const aggregate=crop({plantingCountsByPallet:{}});
  const data=yieldModel.buildDataset({records:[],plantingEvents:[aggregate],asOf});
  assert.equal(yieldModel.currentInput(data,{palletKeys:["2-A-1","2-A-2"]}).plantedHeads,40);
  assert.equal(yieldModel.currentInput(data,{palletKeys:["2-A-1"]}).valid,false);
  assert.equal(yieldModel.buildDataset({records:[full()],plantingEvents:[crop({detailsUnknown:true})],asOf}).yieldRows.length,0);
  assert.equal(yieldModel.buildDataset({records:[full()],plantingEvents:[crop({actualPlantedSeedlingCount:32})],asOf}).yieldRows.length,0);
  assert.equal(yieldModel.buildDataset({records:[full()],plantingEvents:[crop({actualPlantedSeedlingCount:9999})],asOf}).yieldRows.length,0);
});

test("mixed crops cannot split a full record or partial cases into invented allocations",()=>{
  const plantingEvents=[crop({plantingPalletKeys:["2-A-1"],plantingCountsByPallet:{"2-A-1":20},actualPlantedSeedlingCount:20}),
    crop({eventId:2,plantingPalletKeys:["2-A-2"],plantingCountsByPallet:{"2-A-2":20},actualPlantedSeedlingCount:20})];
  const fullMixed=yieldModel.buildDataset({records:[full()],plantingEvents,asOf});
  assert.equal(fullMixed.yieldRows.length,0);
  assert.ok(fullMixed.diagnostics.mixedCrops>0);
  const partialMixed=yieldModel.buildDataset({records:[partial(),full({palletKeys:["2-A-1"],cases:1}),
    full({id:3,recordUuid:"full-3",palletKeys:["2-A-2"],cases:1})],plantingEvents,asOf});
  assert.equal(partialMixed.yieldRows.length,0);
  assert.ok(partialMixed.harvestRows.every(row=>!row.evaluable));
});

test("identical record duplicates deduct once, while overlapping targets and conflicting duplicates are rejected",()=>{
  const p=partial(), f=full();
  const duplicate=yieldModel.buildDataset({records:[p,{...p},f,{...f}],plantingEvents:[crop()],asOf});
  assert.equal(duplicate.yieldRows.length,1);
  assert.equal(duplicate.yieldRows[0].partialHeads,12);
  assert.equal(duplicate.diagnostics.duplicate,2);
  const overlap=partial({targets:[...p.targets,{building:2,bed:"A",start:2,end:2,plantsPerPallet:1}]});
  assert.equal(yieldModel.buildDataset({records:[overlap,f],plantingEvents:[crop()],asOf}).yieldRows.length,0);
  const conflict=yieldModel.buildDataset({records:[p,{...p,cases:2},f],plantingEvents:[crop()],asOf});
  assert.equal(conflict.yieldRows.length,0);
  assert.ok(conflict.diagnostics.conflictingDuplicate>0);
});

test("all required final scopes must close once before crop yield can train",()=>{
  const first=full({palletKeys:["2-A-1"],cases:1});
  const incomplete=yieldModel.buildDataset({records:[first],plantingEvents:[crop()],asOf});
  assert.equal(incomplete.yieldRows.length,0);
  assert.ok(incomplete.crops[0].reasons.includes("incompleteCrop"));
  const second=full({id:3,recordUuid:"full-3",palletKeys:["2-A-2"],cases:1,date:"2025-02-03",createdAt:"2025-02-03T12:00:00+09:00",updatedAt:"2025-02-03T12:00:00+09:00"});
  const complete=yieldModel.buildDataset({records:[first,second],plantingEvents:[crop()],asOf:"2025-02-04"});
  assert.equal(complete.yieldRows.length,1);
  assert.equal(complete.yieldRows[0].cases,2);
  const replaced=yieldModel.buildDataset({records:[first],plantingEvents:[crop(),crop({eventId:2,plantingDate:"2025-02-02",createdAt:"2025-02-02T09:00:00+09:00",updatedAt:"2025-02-02T09:00:00+09:00"})],asOf:"2025-02-04"});
  assert.equal(replaced.yieldRows.length,0);
  assert.ok(replaced.crops[0].reasons.includes("replantedWithoutFullHarvest"));
});

test("partial counters reset with a new planting, and impossible head totals cannot train or score",()=>{
  const next=crop({eventId:2,plantingDate:"2025-02-01",createdAt:"2025-02-01T16:00:00+09:00",updatedAt:"2025-02-01T16:00:00+09:00"});
  const data=yieldModel.buildDataset({records:[partial(),full()],plantingEvents:[crop(),next],asOf});
  const input=yieldModel.currentInput(data,{palletKeys:["2-A-1","2-A-2"],plantingEventId:2});
  assert.equal(input.valid,true);
  assert.equal(input.partialHeads,0);
  assert.equal(yieldModel.currentInput(data,{palletKeys:input.palletKeys,plantingEventId:1}).valid,false);
  const excess=yieldModel.buildDataset({records:[full({cases:9})],plantingEvents:[crop()],asOf});
  assert.equal(excess.yieldRows.length,0);
  assert.equal(excess.harvestRows[0].evaluable,false);
  assert.ok(excess.harvestRows[0].reasons.includes("harvestExceedsPlantedHeads"));
});

test("partial totals follow recorded cases, not rounded average planting counts",()=>{
  const p=partial({targets:[{building:2,bed:"A",start:1,end:2,plantsPerPallet:5.999999}]});
  const data=yieldModel.buildDataset({records:[p,full()],plantingEvents:[crop()],asOf});
  assert.equal(data.yieldRows[0].partialHeads,12);
  const unknown=yieldModel.buildDataset({records:[partial({cases:null}),full()],plantingEvents:[crop()],asOf});
  assert.equal(unknown.yieldRows.length,0);
});

function sequential(count=12){
  const records=[],plantingEvents=[];
  for(let i=0;i<count;i++){
    const plantingDate=add("2024-01-01",i*40),date=add(plantingDate,29);
    plantingEvents.push(crop({eventId:i+1,plantingDate,createdAt:plantingDate+"T09:00:00+09:00",updatedAt:plantingDate+"T09:00:00+09:00"}));
    records.push(full({id:i+1,recordUuid:`full-${i+1}`,date,cases:3,createdAt:date+"T12:00:00+09:00",updatedAt:date+"T12:00:00+09:00"}));
  }
  return {records,plantingEvents,asOf:"2026-01-01",planner};
}
test("walk-forward learns only completed earlier crops and reports case MAE and range coverage",()=>{
  const source=sequential();
  const result=yieldModel.backtest(source);
  assert.equal(result.metrics.predictions,12);
  assert.equal(result.metrics.independentCrops,12);
  assert.ok(Math.abs(result.metrics.mae-1/36)<1e-9);
  assert.equal(result.metrics.intervalCoverage,1);
  assert.equal(result.rows[0].trainingCrops,0);
  result.rows.forEach((row,index)=>{
    assert.equal(row.trainingCrops,index);
    assert.ok(!row.trainingCropIds.includes(row.cropId));
  });
  assert.equal(result.rows.at(-1).reference,false);
  const changed={...source,records:source.records.map((row,index)=>index>=8 ? {...row,cases:0} : row)};
  assert.deepEqual(yieldModel.backtest(changed).rows.slice(0,8),result.rows.slice(0,8));
});

test("multiple harvest dates for one crop cannot let an earlier subset teach its own later subset",()=>{
  const first=full({palletKeys:["2-A-1"],cases:1});
  const second=full({recordUuid:"last",id:2,date:"2025-02-03",palletKeys:["2-A-2"],cases:1,createdAt:"2025-02-03T12:00:00+09:00",updatedAt:"2025-02-03T12:00:00+09:00"});
  const result=yieldModel.backtest({planner,records:[first,second],plantingEvents:[crop()],asOf:"2025-02-05"});
  assert.equal(result.rows.length,2);
  assert.equal(result.metrics.independentCrops,1);
  assert.ok(result.rows.every(row=>row.trainingCrops===0));
});

test("late planting information and same-day partial order remain unscored rather than leaking future inputs",()=>{
  const late=crop({updatedAt:"2025-02-02T09:00:00+09:00"});
  const unavailable=yieldModel.backtest({planner,records:[full()],plantingEvents:[late],asOf:"2025-02-04"});
  assert.equal(unavailable.rows.length,0);
  assert.ok(unavailable.excluded.some(row=>row.reasons.includes("mixedOrUnknownCurrentCrop")));
  const p=partial({date:"2025-02-01",createdAt:"2025-02-01T10:00:00+09:00",updatedAt:"2025-02-01T10:00:00+09:00"});
  const result=yieldModel.backtest({planner,records:[p,full()],plantingEvents:[crop()],asOf});
  assert.equal(result.rows.length,0);
  assert.ok(result.unscored[0].reasons.includes("sameDayPartialOrderUnknown"));
  assert.equal(yieldModel.buildDataset({records:[p,full()],plantingEvents:[crop()],asOf}).yieldRows[0].partialHeads,12);
});

test("known special conditions exclude aggregate yields without assigning their effect to unobserved positions",()=>{
  const observation={observationId:"condition-1",kind:"condition",building:2,bed:"A",palletKeys:["2-A-1"],startDate:"2025-01-10",endDate:"2025-01-15",
    payload:{type:"equipmentFailure",dataPolicy:"exclude"},createdAt:"2025-01-11T09:00:00+09:00",updatedAt:"2025-01-11T09:00:00+09:00"};
  const data=yieldModel.buildDataset({records:[full()],plantingEvents:[crop()],asOf,evidence,observations:[observation]});
  assert.equal(data.yieldRows.length,0);
  assert.equal(data.harvestRows[0].special,true);
  const future={...observation,updatedAt:"2025-02-05T09:00:00+09:00"};
  assert.equal(yieldModel.buildDataset({records:[full()],plantingEvents:[crop()],asOf,evidence,observations:[future]}).yieldRows.length,1);
});

test("stored ranges are supported while missing or malformed quantities never default to zero",()=>{
  const ranges=full({palletKeys:undefined,palletRanges:["2-A-1-2"]});
  assert.equal(yieldModel.buildDataset({records:[ranges],plantingEvents:[crop()],asOf}).yieldRows.length,1);
  for(const cases of [null,"",NaN,Infinity,-1]) assert.equal(yieldModel.buildDataset({records:[full({cases})],plantingEvents:[crop()],asOf}).yieldRows.length,0);
  assert.equal(yieldModel.buildDataset({records:[full({palletRanges:{}})],plantingEvents:[crop()],asOf}).yieldRows.length,0);
  assert.throws(()=>yieldModel.buildDataset({records:[],plantingEvents:[]}),/判定時点/);
});

function generation(source,trainedAsOf,modelVersion){
  const dataset=yieldModel.buildDataset({...source,asOf:trainedAsOf});
  return {modelVersion,trainedAsOf,coefficients:{yield:yieldModel.exportModel({planner,dataset,asOf:trainedAsOf})}};
}
test("immutable yield snapshots preserve exact coefficients and reject future or corrupt restoration",()=>{
  const source=sequential(),trainedAsOf="2025-01-01T12:00:00+09:00",snapshot=generation(source,trainedAsOf,"a");
  const copy=JSON.parse(JSON.stringify(snapshot.coefficients.yield));
  assert.deepEqual(yieldModel.hydrateModel(copy,{asOf:"2026-01-01"}),copy);
  assert.equal(copy.model.rows.length,copy.training.independentCrops);
  assert.ok(copy.training.endDate<trainedAsOf.slice(0,10));
  assert.throws(()=>yieldModel.hydrateModel(copy,{asOf:"2024-12-31"}),/学習日時/);
  assert.throws(()=>yieldModel.hydrateModel({...copy,model:{schemaVersion:1,rows:[{factor:2,building:2}]}}),/係数/);
  const changed=yieldModel.buildDataset({...source,records:source.records.map(row=>({...row,cases:1}))});
  yieldModel.fit({planner,dataset:changed});
  assert.deepEqual(snapshot.coefficients.yield,copy);
});
test("frozen yield comparison uses only new crops after both training instants, with no fitting",()=>{
  const source=sequential(20),active=generation(source,"2024-06-01T12:00:00+09:00","a"),candidate=generation(source,"2024-12-01T12:00:00+09:00","b");
  const result=yieldModel.compareFrozen({...source,asOf:"2027-01-01",activeSnapshot:active,candidateSnapshot:candidate,
    planner:{...planner,fitYield:()=>{throw new Error("must not fit");}}});
  assert.ok(result.activeRows.length>0);
  assert.ok(result.activeRows.every(row=>row.asOf>"2024-12-01" && !candidate.coefficients.yield.training.cropIds.includes(row.cropId)));
  assert.deepEqual(result.activeRows.map(row=>row.cropId),result.candidateRows.map(row=>row.cropId));
  assert.ok(result.activeRows.every((row,index)=>Math.abs(row.predictedCases-result.candidateRows[index].predictedCases)<1e-9));
  assert.equal(result.active.startDate,result.activeRows[0].outcomeDate);
  assert.equal(result.gate.reason,"insufficientYieldEvidence");assert.equal(result.gate.blocking,false);
  const legacy=yieldModel.compareFrozen({...source,activeSnapshot:{...active,coefficients:{}},candidateSnapshot:candidate});
  assert.equal(legacy.gate.blocking,false);assert.equal(legacy.active.predictions,0);
});
test("quantity gate is last-priority non-regression and independently weights repeated scopes",()=>{
  const active=Array.from({length:20},(_,i)=>({id:`h${i}`,cropId:`crop${i}`,asOf:add("2025-01-01",i*4),
    outcomeDate:add("2025-01-02",i*4),building:2,season:0,error:1,intervalHit:1}));
  const candidate=active.map(row=>({...row,error:2,intervalHit:0}));
  const regression=yieldModel.compareRows(active,candidate,{asOf:"2025-04-01"});
  assert.equal(regression.gate.blocking,true);assert.equal(regression.active.independentCrops,20);
  assert.ok(regression.gate.regressions.some(group=>group.metrics.includes("mae")));
  assert.ok(regression.gate.regressions.some(group=>group.metrics.includes("coverage")));
  const sparse=yieldModel.compareRows(active.slice(0,3),candidate.slice(0,3),{asOf:"2025-04-01"});
  assert.equal(sparse.gate.accepted,true);assert.equal(sparse.gate.blocking,false);
  const improved=yieldModel.compareRows(candidate,active,{asOf:"2025-04-01"});
  assert.equal(improved.gate.blocking,false);
  const repeated=active.concat(Array.from({length:100},(_,i)=>({...active[0],id:`scope${i}`,error:9})));
  const summary=yieldModel.metrics(repeated);
  assert.equal(summary.independentCrops,20);
  assert.ok(summary.mae<1.4,"100 slices of one crop cannot dominate the other 19 crops");
  assert.equal(yieldModel.compareRows(active,[],{asOf:"2025-04-01"}).active.predictions,0,"unpaired rows cannot authorize evaluation");
});

function savedFixture(){
  const records=[partial(),full()],plantingEvents=[crop()],capture="2025-01-15T12:00:00+09:00";
  const empty={yieldRows:[]},base={modelVersion:"a",trainedAsOf:"2024-12-01T00:00:00+09:00",coefficients:{
    yield:yieldModel.exportModel({planner,dataset:empty,asOf:"2024-12-01"})}};
  const candidate={...base,modelVersion:"b"};
  const dataset=yieldModel.buildDataset({records,plantingEvents,asOf:capture});
  const p={...yieldModel.predict({planner,model:base.coefficients.yield.model,dataset,palletKeys:crop().plantingPalletKeys,plantingEventId:1}),
    frozen:true,modelVersion:"a",yieldTrainedAsOf:base.coefficients.yield.trainedAsOf};
  const entry={kind:"prediction",asOf:"2025-01-15",capturedAt:capture,payload:{asOf:capture,modelVersion:"a",shadowModelVersion:"b",
    modelTrainedAsOf:base.trainedAsOf,shadowTrainedAsOf:candidate.trainedAsOf,
    predictions:[{plantingEventId:1,plantingDate:"2025-01-01",palletKeys:crop().plantingPalletKeys,
      quantity:p,shadowQuantity:{...p,modelVersion:"b"}}]}};
  return {records,plantingEvents,activeSnapshot:base,candidateSnapshot:candidate,entries:[entry],asOf:"2025-02-04",entry};
}
test("saved quantity scoring reconciles later exact-scope partials and rejects invented sub-scope allocations",()=>{
  const input=savedFixture(),result=yieldModel.compareSaved(input);
  assert.equal(result.activeRows.length,1);assert.equal(result.activeRows[0].actualCases,3,"2 final cases plus 1 intervening partial");
  assert.equal(result.activeRows[0].knownPartialHeads,0);
  const calibrated=yieldModel.scoreSaved(input);
  assert.equal(calibrated.rows[0].modelVersion,"a");assert.equal(calibrated.rows[0].groupId,"planting:1");
  assert.equal(calibrated.rows[0].actualCases,3);
  const later=JSON.parse(JSON.stringify(input.entry));later.asOf="2025-01-16";later.capturedAt="2025-01-16T12:00:00+09:00";later.payload.asOf=later.capturedAt;
  later.payload.predictions[0].quantity.center=0;
  assert.deepEqual(yieldModel.scoreSaved({...input,entries:[later,...input.entries]}).rows,calibrated.rows,"earliest eligible capture is retained");
  const different=JSON.parse(JSON.stringify(input));different.entries[0].payload.predictions[0].palletKeys=["2-A-1"];
  assert.equal(yieldModel.compareSaved(different).activeRows.length,0);
  assert.equal(yieldModel.scoreSaved(different).rows.length,0);
});
test("saved quantity calibration excludes backdated, late-entered, future-trained and unfrozen predictions",()=>{
  const source=savedFixture();
  for(const edit of [
    entry=>{entry.payload.asOf="2025-01-15T13:00:00+09:00";},
    entry=>{entry.capturedAt="2025-02-02T12:00:00+09:00";},
    entry=>{entry.payload.predictions[0].quantity.yieldTrainedAsOf="2025-01-16T12:00:00+09:00";},
    entry=>{entry.payload.predictions[0].quantity.frozen=false;},
    entry=>{entry.payload.predictions[0].quantity.modelVersion="other";}
  ]){
    const changed=JSON.parse(JSON.stringify(source));edit(changed.entries[0]);
    assert.equal(yieldModel.scoreSaved(changed).rows.length,0);
  }
  assert.equal(yieldModel.scoreSaved({...source,plantingEvents:[crop({updatedAt:"2025-01-17T00:00:00+09:00"})]}).rows.length,0);
  assert.equal(yieldModel.scoreSaved({...source,asOf:"2025-01-20"}).rows.length,0);
});
