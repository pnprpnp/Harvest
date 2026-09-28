const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const calibration=require('../src/scripts/growth-calibration.js'),field=require('../src/scripts/growth-field-validation.js');
function setup(){
  const model={fit:{},scope:'siteA',asOf:'2026-09-28T10:00:00+09:00',modelVersion:'v1',engineSamples:[]};
  let reads=0,obsRevision=0,scope='siteA',pending=null;const rendered=[];
  const context=vm.createContext({dashboardGrowthDataRevision:0,dashboardGrowthPredictionModelCache:model,
    HarvestGrowthObservations:{revision:()=>obsRevision,list:()=>[]},HarvestGrowthHistory:{list:async()=>{reads++;return pending?await pending:[];}},
    HarvestGrowthFieldValidation:field,HarvestGrowthCalibration:calibration,HarvestGrowthYield:{scoreSaved:()=>({rows:[]})},
    HarvestGrowthEvidence:{},evaluateDashboardGrowthSavedPredictions:()=>({rows:[]}),records:[],plantingEvents:[],
    getDashboardGrowthHistoryScope:()=>scope,document:{getElementById:()=>null}});
  vm.runInContext(fs.readFileSync(require.resolve('../src/scripts/app/growth-review.js'),'utf8'),context);
  context.renderDashboardGrowthReview=result=>rendered.push(result);
  return {context,model,rendered,get reads(){return reads;},set pending(value){pending=value;},set scope(value){scope=value;},changeObservation(){obsRevision++;}};
}
test('calibration refreshes with farm evidence or day and never scans history for every tab repaint',async()=>{
  const e=setup();
  await e.context.refreshDashboardGrowthReview(e.model);
  await e.context.refreshDashboardGrowthReview(e.model);
  assert.equal(e.reads,1);assert.equal(e.rendered[0].calibration.all.metrics.confidenceLabel,'データ不足');
  e.context.dashboardGrowthDataRevision++;await e.context.refreshDashboardGrowthReview(e.model);assert.equal(e.reads,2);
  e.changeObservation();await e.context.refreshDashboardGrowthReview(e.model);assert.equal(e.reads,3);
  e.model.asOf='2026-09-29T10:00:00+09:00';await e.context.refreshDashboardGrowthReview(e.model);assert.equal(e.reads,4);
});
test('late review results cannot publish into another site or an updated source revision',async()=>{
  const e=setup();let release;e.pending=new Promise(resolve=>release=resolve);
  const first=e.context.refreshDashboardGrowthReview(e.model);e.scope='siteB';release([]);await first;assert.equal(e.rendered.length,0);
  const second=setup();let next;second.pending=new Promise(resolve=>next=resolve);
  const review=second.context.refreshDashboardGrowthReview(second.model);second.context.dashboardGrowthDataRevision++;
  next([]);await review;assert.equal(second.rendered.length,0);
});
