#!/usr/bin/env node
"use strict";
// Reproduce the application's walk-forward evaluation from its local JSON export.
// No network access, dependencies, or changes to the input file.
const fs = require("node:fs");
const model = require("../src/scripts/growth-model.js");

function evaluateExport(payload, asOf){
  if(payload?.app !== "Harvestnavi" || payload?.type !== "growth-evaluation-backup"
    || payload.schemaVersion !== 1 || !Array.isArray(payload.samples)){
    throw new Error("生育予測の「予報・予測履歴を書き出す」で保存したJSONを指定してください。");
  }
  const origin = asOf || payload.asOf || payload.exportedAt || payload.backtest?.asOf;
  if(!model.dateKey(origin)) throw new Error("評価時点の日付が正しくありません。");
  const forecastHistory = (payload.weatherHistory || []).flatMap(entry =>
    (entry.payload?.daily || []).map(day => ({ ...day,
      availableAt:entry.capturedAt,
      issuedAt:day.issuedAt || entry.payload.issuedAt || ""
    })));
  const result = model.backtest(payload.samples, { asOf:origin,
    weatherDaily:payload.weather?.daily || [], forecastHistory, maxFolds:24 });
  return { app:"Harvestnavi", type:"growth-backtest-result", schemaVersion:1,
    modelVersion:model.schemaVersion, sourceExportedAt:payload.exportedAt, asOf:origin, result };
}

if(require.main === module){
  try{
    const [input, ...args] = process.argv.slice(2);
    if(!input || args.length && (args.length !== 2 || args[0] !== "--as-of")){
      throw new Error("使用方法: node tools/evaluate_growth.cjs 履歴.json [--as-of YYYY-MM-DD]");
    }
    const payload = JSON.parse(fs.readFileSync(input, "utf8"));
    process.stdout.write(JSON.stringify(evaluateExport(payload, args[1]), null, 2) + "\n");
  }catch(error){ process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
module.exports = { evaluateExport };
