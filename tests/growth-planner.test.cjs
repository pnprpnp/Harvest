const test = require('node:test');
const assert = require('node:assert/strict');
const planner = require('../src/scripts/growth-planner.js');
test('12 heads per case uses explicit per-pallet counts and subtracts partial once',()=>{
  const q = planner.quantity(planner.fitYield([]),{pallets:[{plantedHeads:12},{plantedHeads:20,partialHeads:8}]});
  assert.equal(q.center,2); assert.equal(q.high,2); assert.equal(q.low,0);
  assert.equal(planner.quantity(null,{pallets:[{}]}).center,null);
});
test('robust actual yield, duplicate and impossible rows do not invent a loss rate',()=>{
  const model=planner.fitYield([{id:'1',plantedHeads:120,cases:8,partialHeads:12},
    {id:'1',plantedHeads:120,cases:1},{id:'2',plantedHeads:12,cases:80}]);
  assert.equal(model.rows.length,1);
  assert.equal(planner.quantity(model,{pallets:[{plantedHeads:120,partialHeads:12}]}).center,8);
});
test('calendar counts one first day, tracks remaining window, never extends forecast',()=>{
  const item={id:'crop',readyStart:'2026-09-26',readyEnd:'2026-09-28',quantity:{center:18,low:16,high:19}};
  const days=planner.calendar([item,item],{today:'2026-09-26',forecastEndDate:'2026-09-28'});
  assert.equal(days[0].cases,18); assert.equal(days[1].cases,0); assert.equal(days[1].ongoing.length,1);
  assert.equal(days[3].predicted,false); assert.equal(days[3].cases,null);
  assert.equal(planner.calendar([],{today:'2026-09-26',forecastEndDate:'2026-09-29'})[3].predicted,true);
});
test('small high-risk crop is not promoted and warning ordering is quality priority',()=>{
  const item={id:'a',currentStatus:'small',readyStart:'2026-09-28',risk:{tipburn:{level:'high'},elongated:{level:'high'},uneven:{level:'high'}}};
  assert.equal(planner.priority(item,'2026-09-26'),'later');
  assert.deepEqual(planner.warnings([item],'2026-09-26').map(x=>x.kind),['elongated','uneven','tipburn']);
  assert.equal(planner.warnings([item],'2026-09-26')[0].daysToReady,2);
});
test('only two-day shifts and direct low to high create notifications',()=>{
  const old={id:'crop',readyStart:'2026-09-28',risk:{elongated:{level:'low'},uneven:{level:'medium'}}};
  assert.equal(planner.changes([old],[{...old,readyStart:'2026-09-29'}]).length,0);
  const alerts=planner.changes([old],[{...old,readyStart:'2026-09-30',risk:{elongated:{level:'high'},uneven:{level:'high'}}}]);
  assert.equal(alerts.length,2); assert.equal(alerts[1].kind,'elongated');
  assert.equal(planner.changes([old],[{...old,id:'new-crop',readyStart:'2026-10-01'}]).length,0);
});
test('manual offset preserves original prediction and cannot extend forecast',()=>{
  const item=planner.adjusted({readyStart:'2026-09-28',readyEnd:'2026-09-30'},3,'2026-09-30');
  assert.equal(item.aiReadyStart,'2026-09-28'); assert.equal(item.readyStart,null); assert.equal(item.readyEnd,null);
});
