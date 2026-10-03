"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function context(){
  const frames = [], tasks = [], renders = [], loading = [];
  const c = vm.createContext({
    dashboardRenderScheduleId: 0, activeAppTab: "dashboard",
    dashboardFilter: { dashboardSubtab: "guide", resultsView: "calendar" },
    dashboardRenderedDayKey: "today", dashboardRenderedSubtabs: new Set(),
    dashboardSeedlingStatusDetailOpen: false, dashboardGrowthPredictionModelCache: null,
    normalizeDashboardSubtab: value => value,
    normalizeDashboardResultsView: value => value,
    formatDateOnlyString: () => "today",
    saveDashboardFilter: () => {}, syncDashboardSubtabUi: () => {},
    syncDashboardResultsViewUi: () => {},
    setDashboardLoadingState: value => loading.push(value),
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout: callback => tasks.push(callback),
    console: { error: () => {} },
    renderDashboard: () => {
      renders.push([c.dashboardFilter.dashboardSubtab, c.dashboardFilter.resultsView]);
      c.dashboardRenderedSubtabs.add(c.dashboardFilter.dashboardSubtab);
      c.dashboardRenderedDayKey = "today";
    }
  });
  for(const [file, names] of [
    ["01-core-ui-and-workflow.js", ["runAfterUiSettles", "scheduleDashboardRenderAfterTabSelection", "cancelDashboardRenderAfterTabSelection"]],
    ["07-dashboard.js", ["setDashboardSubtab", "setDashboardResultsView"]]
  ]){
    const source = fs.readFileSync(path.join(__dirname, "../src/scripts/app", file), "utf8");
    for(const name of names){
      const start = source.indexOf(`function ${name}(`);
      assert.notEqual(start, -1);
      vm.runInContext(source.slice(start, source.indexOf("\n}", start) + 2), c);
    }
  }
  const paint = () => { frames.splice(0).forEach(callback => callback()); };
  const flush = () => { paint(); tasks.splice(0).forEach(callback => callback()); };
  return { c, renders, loading, paint, flush };
}

test("all dashboard tabs select before the paint and load afterwards", () => {
  const { c, renders, paint, flush } = context();
  for(const subtab of ["seedlings", "growth", "graphs", "guide"]){
    const before = renders.length;
    c.setDashboardSubtab(subtab);
    assert.equal(c.dashboardFilter.dashboardSubtab, subtab);
    assert.equal(renders.length, before);
    paint();
    assert.equal(renders.length, before);
    flush();
    assert.equal(renders.length, before + 1);
    assert.equal(renders.at(-1)[0], subtab);
  }
});

test("rapid selections load only the last tab and keep its loading state", () => {
  const { c, renders, loading, flush } = context();
  c.setDashboardSubtab("seedlings");
  c.setDashboardSubtab("growth");
  c.setDashboardSubtab("graphs");
  flush();
  assert.deepEqual(renders, [["graphs", "calendar"]]);
  assert.deepEqual(loading, [true, true, true, false]);
});

test("returning to a cached tab cancels pending work without rereading", () => {
  const { c, renders, loading, flush } = context();
  c.dashboardRenderedSubtabs.add("guide");
  c.setDashboardSubtab("seedlings");
  c.setDashboardSubtab("guide");
  flush();
  assert.deepEqual(renders, []);
  assert.equal(loading.at(-1), false);
});

test("leaving the dashboard cancels its pending work", () => {
  const { c, renders, loading, flush } = context();
  c.setDashboardSubtab("seedlings");
  c.activeAppTab = "record";
  c.cancelDashboardRenderAfterTabSelection();
  flush();
  assert.deepEqual(renders, []);
  assert.equal(loading.at(-1), false);
});

test("results view switches select first and load only the last view", () => {
  const { c, renders, flush } = context();
  c.dashboardFilter.dashboardSubtab = "graphs";
  c.dashboardRenderedSubtabs.add("graphs");
  c.setDashboardResultsView("harvestStart");
  c.setDashboardResultsView("graphs");
  assert.equal(c.dashboardFilter.resultsView, "graphs");
  assert.deepEqual(renders, []);
  flush();
  assert.deepEqual(renders, [["graphs", "graphs"]]);
});

test("a cached tab from yesterday still loads after selection", () => {
  const { c, renders, flush } = context();
  c.dashboardRenderedDayKey = "yesterday";
  c.dashboardRenderedSubtabs.add("seedlings");
  c.setDashboardSubtab("seedlings");
  assert.deepEqual(renders, []);
  flush();
  assert.deepEqual(renders, [["seedlings", "calendar"]]);
});

test("an interrupted results view load resumes when returning to results", () => {
  const { c, renders, flush } = context();
  c.dashboardFilter.dashboardSubtab = "graphs";
  c.dashboardRenderedSubtabs.add("graphs");
  c.dashboardRenderedSubtabs.add("guide");
  c.setDashboardResultsView("graphs");
  c.setDashboardSubtab("guide");
  flush();
  assert.deepEqual(renders, []);
  c.setDashboardSubtab("graphs");
  flush();
  assert.deepEqual(renders, [["graphs", "graphs"]]);
});

test("render failure clears loading and permits retry", () => {
  const { c, loading, flush } = context();
  let attempts = 0;
  c.renderDashboard = () => { if(++attempts === 1) throw new Error("load failed"); };
  c.setDashboardSubtab("seedlings");
  flush();
  assert.equal(loading.at(-1), false);
  c.setDashboardSubtab("seedlings");
  flush();
  assert.equal(attempts, 2);
  assert.equal(loading.at(-1), false);
});
