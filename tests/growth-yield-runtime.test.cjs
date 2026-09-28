"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
test("quantity reconciliation reuses record revisions and production never refits coefficients",()=>{
  let fits=0,evaluations=0,builds=0,obsRevision=0,asOf="2026-09-27T12:00:00+09:00";
  const c=vm.createContext({getDashboardGrowthAsOf:()=>asOf,getDashboardGrowthHistoryScope:()=>"farm",dashboardGrowthDataRevision:0,
    records:[],plantingEvents:[],HarvestGrowthEvidence:{},HarvestGrowthPlanner:{},
    HarvestGrowthObservations:{revision:()=>obsRevision,list:()=>[]},
    HarvestGrowthYield:{buildDataset:()=>{builds++;return {};},fit:()=>{fits++;return {model:{}};},predict:()=>({readinessEvaluated:false}),
      backtest:()=>{evaluations++;return {metrics:{mae:null}};}}});
  vm.runInContext(fs.readFileSync(require("node:path").join(__dirname,"../src/scripts/app/growth-runtime.js"),"utf8"),c);
  assert.equal(fits,0);assert.equal(c.getDashboardGrowthYieldPrediction(["2-A-1"],1).readinessEvaluated,false);
  c.inspectDashboardGrowthYield();c.inspectDashboardGrowthYield();assert.equal(fits,0);assert.equal(evaluations,1);
  asOf="2026-09-27T20:00:00+09:00";c.weather={daily:[]};c.getDashboardGrowthYieldPrediction(["2-A-1"],1);assert.equal(builds,1);
  c.dashboardGrowthDataRevision++;c.getDashboardGrowthYieldAnalysis();assert.equal(builds,2);
  obsRevision++;c.getDashboardGrowthYieldAnalysis();assert.equal(builds,3);
  asOf="2026-09-28T01:00:00+09:00";c.getDashboardGrowthYieldAnalysis();assert.equal(builds,4);assert.equal(fits,0);assert.equal(evaluations,1);
});

test("production quantities retain their generation across record changes and reuse frozen hydration",()=>{
  const yieldEngine=require('../src/scripts/growth-yield.js'),planner=require('../src/scripts/growth-planner.js');
  let generationReads=0;
  const coefficients={schemaVersion:1,trainedAsOf:'2026-01-01',model:{schemaVersion:1,rows:[{factor:0.8,building:2}]},
    training:{independentCrops:1,cropIds:['old']}};
  const context=vm.createContext({getDashboardGrowthAsOf:()=>'2026-09-28T10:00:00+09:00',getDashboardGrowthHistoryScope:()=>'farm',
    dashboardGrowthDataRevision:0,records:[],plantingEvents:[],HarvestGrowthEvidence:{},HarvestGrowthPlanner:planner,
    HarvestGrowthObservations:{revision:()=>0,list:()=>[]},HarvestGrowthYield:yieldEngine});
  vm.runInContext(fs.readFileSync(require.resolve('../src/scripts/app/growth-runtime.js'),'utf8'),context);
  context.getDashboardGrowthLearningRegistry=()=>({getGeneration:version=>{generationReads++;return {modelSnapshot:{modelVersion:version,coefficients:{yield:coefficients}}};}});
  const first=context.getDashboardGrowthFrozenYieldModel('v1');
  coefficients.model.rows[0].factor=0.2;
  context.dashboardGrowthDataRevision++;
  assert.equal(context.getDashboardGrowthFrozenYieldModel('v1').model.rows[0].factor,0.8);
  assert.equal(generationReads,1);
  assert.equal(context.getDashboardGrowthFrozenYieldModel('v2').model.rows[0].factor,0.2);
  assert.equal(first.modelVersion,'v1');
});
