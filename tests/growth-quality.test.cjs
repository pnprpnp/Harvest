"use strict";
const test=require("node:test"), assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.join(__dirname,"..");
const plain=value=>JSON.parse(JSON.stringify(value));
function extract(file,name){
  const source=fs.readFileSync(path.join(root,file),"utf8"),start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`${name} missing`);
  const firstEnd=source.indexOf("\n",start);
  const end=source.slice(start,firstEnd).endsWith("}") ? firstEnd : source.indexOf("\n}",start)+2;
  return source.slice(start,end);
}
function browser(){
  const controls={};
  for(const name of ["recordHarvestUnevenInput","recordGrowthReadyDateInput","recordGrowthReadyModeInput","recordGrowthUnevenStatusInput","recordGrowthTipburnStatusInput","recordGrowthElongatedStatusInput","recordGrowthCultivarInput"]){
    controls[name]={value:"",checked:false,options:[{value:""},{value:"マルチリーフエアリ"}],appendChild(item){this.options.push(item);}};
  }
  const sizes=["unknown","small","normal","large"].map(value=>({value,checked:false}));
  const tags={chip:{checked:false},elongated:{checked:false}};
  const c=vm.createContext({BUILDINGS:[2,3,4,5,6,7,8,9],bedOrder:["A","B","C","D","E","F"],
    harvestFillKeys:["2-A-1","2-B-1"],recordHarvestGrowthBedOverrides:{},growthObservationLegacyServerWarningShown:false,
    getPalletKeysFromRecord:record=>record.palletKeys || [],
    getSelectedQualityMemo:()=>({tags:Object.entries(tags).filter(([,v])=>v.checked).map(([k])=>k),other:""}),
    document:{getElementById:id=>controls[id],querySelectorAll:()=>sizes,createElement:()=>({}),
      querySelector:selector=>selector.includes("recordHarvestSizeRating") ? sizes.find(item=>item.checked) : tags[selector.match(/value="(.*?)"/)?.[1]]}
  });
  const files={
    "src/scripts/app/03-sheet-sync-core.js":["isStrictDateOnlyString"],
    "src/scripts/app/06-settings.js":["parsePalletKey"],
    "src/scripts/app/02-local-data.js":["normalizeQualityTag","normalizeQualityMemo","normalizeHarvestSizeRating","getHarvestBedKeyFromPalletKey","getHarvestBedKeysFromPalletKeys",
      "normalizeHarvestSymptomStatus","isHarvestSymptomPresent","hasHarvestGrowthObservationFields","normalizeHarvestGrowthObservations","normalizeHarvestGrowthDetail",
      "getHarvestGrowthOverallState","getHarvestGrowthStateForBed","getSelectedHarvestSizeRating","getSelectedHarvestGrowthDetail","setSelectedHarvestGrowthAssessment"],
    "src/scripts/app/09-record-workflow.js":["getCurrentRecordHarvestGrowthOverallState","compactRecordHarvestGrowthBedOverrides"],
    "src/scripts/app/15-sync-reconcile-and-backup.js":["preserveHarvestGrowthObservationsForLegacySync"]
  };
  for(const [file,names] of Object.entries(files)) for(const name of names) vm.runInContext(extract(file,name),c);
  return c;
}
function server(){
  const c=vm.createContext({HARVEST_BUILDINGS:[2,3,4,5,6,7,8,9],HARVEST_BEDS:["A","B","C","D","E","F"],RECORD_GROWTH_DETAIL_LENGTH_LIMIT:20000});
  for(const name of ["isPlainObject","normalizeRequiredEnum","normalizeRequiredDate","normalizeOptionalDate","normalizeOptionalText","normalizeOptionalSizeRating","normalizeHarvestGrowthDetailInput"]){
    vm.runInContext(extract("apps-script/src/04-request-normalization.js",name),c);
  }
  return c;
}
const sample=(status="unknown",extra={})=>({type:"fullHarvest",date:"2026-09-25",palletKeys:["2-A-1","2-B-1"],sizeRating:"normal",qualityMemo:{tags:[],other:""},
  growthDetail:{schemaVersion:3,readyDate:"2026-09-20",readyDateMode:"manual",unevenStatus:status,tipburnStatus:status,elongatedStatus:status,cultivar:"マルチリーフエアリ",
    bedOverrides:{"2-B":{sizeRating:"large",uneven:false,tipburn:false,elongated:false,readyDate:"",readyDateMode:"none",unevenStatus:"many",tipburnStatus:"slight",elongatedStatus:"none"}},...extra}});

test("unknown/none/slight/many and old present survive normalize, form restore, save, server and JSON roundtrip",()=>{
  const front=browser(), back=server();
  for(const status of ["unknown","none","slight","many","present"]){
    const record=sample(status); record.growthDetail=plain(front.normalizeHarvestGrowthDetail(record.growthDetail,["2-A","2-B"]));
    front.setSelectedHarvestGrowthAssessment(record);
    const selected=plain(front.getSelectedHarvestGrowthDetail(record.palletKeys));
    assert.deepEqual(selected,record.growthDetail,`form ${status}`);
    const normalized=plain(back.normalizeHarvestGrowthDetailInput(JSON.stringify(selected),record.palletKeys,record.date));
    assert.deepEqual(normalized,selected,`server ${status}`);
    const restored=plain(front.normalizeHarvestGrowthDetail(JSON.parse(JSON.stringify(normalized)),["2-A","2-B"]));
    assert.deepEqual(restored,selected,`backup ${status}`);
    assert.equal(front.getHarvestGrowthStateForBed({...record,growthDetail:restored},"2-A").unevenStatus,status);
    const bed=front.getHarvestGrowthStateForBed({...record,growthDetail:restored},"2-B");
    assert.equal(bed.tipburnStatus,"slight"); assert.equal(bed.tipburn,true); assert.equal(bed.readyDateMode,"none");
  }
});
test("old absent checkboxes stay unknown while old positives remain present, without invented severity or cultivar",()=>{
  const c=browser();
  for(const positive of [false,true]){
    const record={type:"fullHarvest",palletKeys:["2-A-1"],qualityMemo:{tags:positive?["chip","elongated"]:[],other:""},growthDetail:{uneven:positive,bedOverrides:{}}};
    const state=c.getHarvestGrowthStateForBed(record,"2-A");
    assert.equal(state.tipburnStatus,positive?"present":"unknown"); assert.equal(state.elongatedStatus,positive?"present":"unknown");
    assert.equal(state.unevenStatus,positive?"present":"unknown"); assert.equal(state.cultivar,""); assert.equal(state.readyDateMode,"auto");
  }
});
test("v2 server responses preserve v3 date modes, uneven severity and known symptom severity",()=>{
  const c=browser(),local=sample("many"),incoming=sample("unknown");
  local.growthDetail=c.normalizeHarvestGrowthDetail(local.growthDetail,["2-A","2-B"]);
  incoming.sizeRating="small";
  incoming.growthDetail={schemaVersion:2,uneven:false,readyDate:"",tipburnStatus:"present",elongatedStatus:"unknown",cultivar:"マルチリーフエアリ",
    bedOverrides:{"2-B":{sizeRating:"small",uneven:false,tipburn:true,elongated:false,readyDate:"2026-09-21",tipburnStatus:"present",elongatedStatus:"none"}}};
  const before=JSON.stringify(incoming),result=c.preserveHarvestGrowthObservationsForLegacySync(local,incoming);
  assert.equal(JSON.stringify(incoming),before,"response must remain unmodified");
  assert.equal(result.sizeRating,"small"); assert.equal(result.growthDetail.schemaVersion,3);
  assert.equal(result.growthDetail.readyDateMode,"manual"); assert.equal(result.growthDetail.readyDate,"2026-09-20");
  assert.equal(result.growthDetail.unevenStatus,"many"); assert.equal(result.growthDetail.uneven,true);
  assert.equal(result.growthDetail.tipburnStatus,"many"); assert.equal(result.growthDetail.elongatedStatus,"many");
  const bed=result.growthDetail.bedOverrides["2-B"];
  assert.equal(bed.sizeRating,"small"); assert.equal(bed.readyDateMode,"none"); assert.equal(bed.readyDate,"");
  assert.equal(bed.unevenStatus,"many"); assert.equal(bed.uneven,true); assert.equal(bed.tipburnStatus,"slight"); assert.equal(bed.tipburn,true);
});
test("v1 protection keeps v2 observations, respects incoming legacy positives and accepts supported v3 clearing",()=>{
  const c=browser(),local=sample("none");
  local.growthDetail={schemaVersion:2,uneven:false,readyDate:"2026-09-20",tipburnStatus:"none",elongatedStatus:"none",cultivar:"マルチリーフエアリ",bedOverrides:{}};
  const old={...local,qualityMemo:{tags:["chip"],other:""},growthDetail:{uneven:true,bedOverrides:{}}};
  const protectedRecord=c.preserveHarvestGrowthObservationsForLegacySync(local,old);
  assert.equal(protectedRecord.growthDetail.tipburnStatus,"present"); assert.equal(protectedRecord.growthDetail.elongatedStatus,"none");
  assert.equal(protectedRecord.growthDetail.uneven,true); assert.equal(protectedRecord.growthDetail.readyDate,"2026-09-20");
  const current=sample("many"),cleared=sample("none",{readyDate:"",readyDateMode:"none"});
  assert.equal(c.preserveHarvestGrowthObservationsForLegacySync(current,cleared),cleared);
});
test("server rejects invalid severity/mode/future ready date and form compaction preserves distinct unknown/none",()=>{
  const c=browser(),s=server(),record=sample("none");
  for(const extra of [{tipburnStatus:"low"},{unevenStatus:"false"},{readyDateMode:"off"},{readyDate:"2026-09-26"}]){
    assert.throws(()=>s.normalizeHarvestGrowthDetailInput({...record.growthDetail,...extra},record.palletKeys,record.date));
  }
  record.growthDetail.bedOverrides["2-B"]={sizeRating:"normal",uneven:false,tipburn:false,elongated:false,
    readyDate:"2026-09-20",readyDateMode:"manual",unevenStatus:"unknown",tipburnStatus:"none",elongatedStatus:"none"};
  c.setSelectedHarvestGrowthAssessment(record); c.compactRecordHarvestGrowthBedOverrides();
  assert.ok(c.getSelectedHarvestGrowthDetail().bedOverrides["2-B"],"unknown is not equivalent to confirmed none");
});
