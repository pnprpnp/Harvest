// Read-only farm evidence reports, cached separately from prediction coefficients.
let dashboardGrowthReviewCache=null;
let dashboardGrowthSimilarityCache=null;

function getDashboardGrowthReviewKey(model){
  return `${model.scope}:${dashboardGrowthDataRevision}:${HarvestGrowthObservations.revision()}:${model.asOf.slice(0,10)}:${model.modelVersion}`;
}

async function refreshDashboardGrowthReview(model){
  if(!model?.fit || !model.scope) return;
  const key=getDashboardGrowthReviewKey(model);
  if(dashboardGrowthReviewCache?.key!==key){
    const current={key};
    dashboardGrowthReviewCache=current;
    current.promise=(async()=>{
      const entries=await HarvestGrowthHistory.list(model.scope,"prediction");
      const saved=evaluateDashboardGrowthSavedPredictions(entries,model.engineSamples || model.samples,{asOf:model.asOf});
      const field=HarvestGrowthFieldValidation.evaluate({samples:model.engineSamples || [],observations:HarvestGrowthObservations.list(),asOf:model.asOf});
      const cases=HarvestGrowthYield.scoreSaved({entries,records,plantingEvents,asOf:model.asOf,
        modelVersion:model.modelVersion,evidence:HarvestGrowthEvidence,observations:HarvestGrowthObservations.list()});
      const calibration=HarvestGrowthCalibration.build({rows:saved.rows,caseRows:cases.rows,asOf:model.asOf,modelVersion:model.modelVersion});
      return {saved,field,calibration};
    })();
  }
  const current=dashboardGrowthReviewCache;
  try{
    const result=await current.promise;
    if(dashboardGrowthReviewCache!==current || model.scope!==getDashboardGrowthHistoryScope()
      || dashboardGrowthPredictionModelCache!==model || key!==getDashboardGrowthReviewKey(model)) return;
    current.result=result;
    renderDashboardGrowthReview(result,model);
  }catch(error){
    if(dashboardGrowthReviewCache!==current) return;
    dashboardGrowthReviewCache=null;
    const container=document.getElementById("dashboardGrowthReview");
    if(container) container.textContent="保存履歴の検証を読み込めませんでした。予測結果には影響しません。";
  }
}

function formatDashboardGrowthReviewNumber(value,suffix=""){
  return Number.isFinite(value) ? `${Math.round(value*100)/100}${suffix}` : "未評価";
}

function getDashboardGrowthCalibrationSummaryHtml(section,label){
  const m=section.metrics,n=formatDashboardGrowthReviewNumber;
  const metric=(value,suffix="")=>`${n(value.value,suffix)}（独立${value.independentCrops}作${value.status==="insufficient-data" ? "・データ不足" : ""}）`;
  const rate=value=>metric({...value,value:Number.isFinite(value.value) ? value.value*100 : null},"%");
  return `<p><strong>${escapeHtml(label)}</strong>：${m.predictions}件・独立${m.independentCrops}作。${escapeHtml(m.period.start || "期間不明")}〜${escapeHtml(m.period.end || "期間不明")}</p>
    <p>適期日MAE：${metric(m.readyMAE,"日")}／区間に入った割合：${rate(m.intervalCoverage)}<br>大きさ的中率：${rate(m.sizeAccuracy)}<br>${[["elongated","徒長"],["uneven","ばらつき"],["tipburn","チップバーン"]].map(([key,name])=>`${name}の程度的中率：${rate(m.quality[key].accuracy)}`).join("<br>")}<br>ケース数MAE：${metric(m.cases.mae,"ケース")}／bias：${metric(m.cases.bias,"ケース")}／区間内：${rate(m.cases.coverage)}</p>`;
}

function renderDashboardGrowthReview(result,model){
  const container=document.getElementById("dashboardGrowthReview");
  if(!container) return;
  const c=result.calibration,interval=c.all.interval;
  const intervalStatus=({"validated-reference":"後続データで参考区間を検証済み（元予測へは未適用）","validation-failed":"補正区間の検証条件を満たしていません","mixed-generations":"世代ごとに分けて確認してください"})[interval.status] || "区間補正は評価データ不足";
  const slices=[getDashboardGrowthCalibrationSummaryHtml(c.recent,"最近90日"),
    ...Object.entries(c.seasons).map(([key,value])=>getDashboardGrowthCalibrationSummaryHtml(value,["冬","春","夏","秋"][Number(key)])),
    ...Object.entries(c.buildings).map(([key,value])=>getDashboardGrowthCalibrationSummaryHtml(value,`${key}号棟`)),
    ...Object.entries(c.byConfidence).map(([key,value])=>getDashboardGrowthCalibrationSummaryHtml(value,`表示信頼度：${({reference:"参考値",insufficient:"データ不足",moderate:"中",high:"高"})[key] || key}`))].join("");
  container.innerHTML=`<details><summary>区間・信頼度の検証</summary><p>現在のモデル世代に保存された予測を検証します。件数だけで「高」へ変更しません。</p>${getDashboardGrowthCalibrationSummaryHtml(c.all,"全期間")}
    <p>${escapeHtml(intervalStatus)}。補正用20作と、その後の別20作・5予測時点・全体90日以上が検証開始の目安です。</p>
    ${Number.isFinite(interval.validationCoverage) ? `<p>後続${interval.validationCrops}作での区間内割合：${formatDashboardGrowthReviewNumber(interval.validationCoverage*100,"%")}。これは精度保証ではありません。</p>` : ""}
    <details><summary>最近・季節・号棟・信頼度別</summary>${slices}</details></details>
    <details><summary>ケース数の検証</summary><div id="dashboardGrowthYieldReview"></div><button type="button" class="dashboardInlineBtn" data-ui-click="showDashboardGrowthYieldValidation">ケース数の時系列検証を確認</button><div id="dashboardGrowthYieldBacktest"></div></details>
    <details><summary>途中評価と収穫結果の確認</summary><div id="dashboardGrowthFieldReview"></div></details>`;
  renderDashboardGrowthYieldReview(model);
  renderDashboardGrowthFieldReview(result.field);
}

function getDashboardGrowthYieldMetricsHtml(metrics,label){
  if(!metrics) return `<p>${escapeHtml(label)}：ケース数は評価データ不足</p>`;
  const n=formatDashboardGrowthReviewNumber,period=metrics.period || {};
  return `<p><strong>${escapeHtml(label)}</strong>：${metrics.predictions || 0}件・独立${metrics.independentCrops || 0}作<br>MAE（平均絶対誤差）：${n(metrics.mae,"ケース")}／bias（正は多めの予測）：${n(metrics.bias,"ケース")}<br>区間に入った割合：${n(Number.isFinite(metrics.intervalCoverage) ? metrics.intervalCoverage*100 : null,"%")}<br>${escapeHtml(period.start || metrics.startDate || "期間不明")}〜${escapeHtml(period.end || metrics.endDate || "期間不明")}</p>`;
}

function renderDashboardGrowthYieldReview(model){
  const container=document.getElementById("dashboardGrowthYieldReview");
  if(!container) return;
  const comparison=getDashboardGrowthLearningRegistry().getState().evaluation?.summary?.yield;
  container.innerHTML=comparison ? `<p>適期・品質・大きさを優先し、ケース数の改善だけで悪化したモデルを採用しません。${escapeHtml(comparison.gate?.label || "ケース数は評価データ不足")}</p>${getDashboardGrowthYieldMetricsHtml(comparison.frozen?.active,"凍結した使用中モデル")}${getDashboardGrowthYieldMetricsHtml(comparison.frozen?.candidate,"凍結した候補モデル")}<details><summary>実際に保存した新旧のケース予測</summary>${getDashboardGrowthYieldMetricsHtml(comparison.prospective?.active,"使用中")}${getDashboardGrowthYieldMetricsHtml(comparison.prospective?.candidate,"候補")}</details>`
    : "<p>ケース数は評価データ不足。使用中の世代に数量係数がない場合は、固定の初期値による参考表示です。</p>";
}

function showDashboardGrowthYieldValidation(){
  const container=document.getElementById("dashboardGrowthYieldBacktest");
  if(!container) return;
  try{
    const result=inspectDashboardGrowthYield();
    container.innerHTML=getDashboardGrowthYieldMetricsHtml(result.metrics,"時系列バックテスト")
      +"<p>各時点より前に完結した別の作から計算した参考評価です。保存された世代間比較とは区別し、自動採用には使用しません。</p>";
  }catch(error){container.textContent="ケース数を検証できませんでした。記録と実苗数を確認してください。";}
}

function renderDashboardGrowthFieldReview(result){
  const container=document.getElementById("dashboardGrowthFieldReview");
  if(!container) return;
  const s=result.summary || {};
  const label=value=>({small:"小",normal:"並",large:"大",unknown:"不明",none:"なし",slight:"少し",many:"多い","legacy-present":"あり（程度不明）"})[value] || "不明";
  const comparisons=(result.trajectories || []).flatMap(crop=>crop.comparisons || []).slice(-8);
  const rows=comparisons.map(pair=>`<li>${escapeHtml(`${pair.fromDate} → ${pair.toDate}・${({harvest:"収穫",partialHarvest:"部分収穫",ready:"適期確認",fieldAssessment:"途中評価"})[pair.toKind] || pair.toKind}・${pair.palletKeys.length}パレット`)}<br>${pair.toKind==="ready" ? "適期を確認（大きさの正解には変換しません）" : `大きさ：${label(pair.size.from)} → ${label(pair.size.to)}`}${pair.toKind==="partialHarvest" ? "（選別された株）" : ""}<br>${[["elongated","徒長"],["uneven","ばらつき"],["tipburn","チップバーン"]].map(([key,name])=>`${name}：${label(pair.quality[key].from)} → ${label(pair.quality[key].to)}`).join("／")}</li>`).join("");
  container.innerHTML=`<p>途中評価の比較対象：独立${s.independentCrops || 0}作・${s.outcomeComparisons || 0}組。小→並→大の自然な変化を誤り扱いしません。途中評価は学習の正解に使いません。${result.status==="insufficient-data" ? "整合性の評価データ不足。" : "結果は参考検証です。"}</p><p>20独立作は検証計画を見直す目安です。教師への自動採用条件ではありません。</p>${rows ? `<ul>${rows}</ul>` : ""}`;
}

function showDashboardGrowthSimilar(building,bed){
  const model=dashboardGrowthPredictionModelCache,container=document.getElementById(`dashboardGrowthSimilar-${building}-${bed}`);
  const item=model?.predictions.get(`${building}-${bed}`);
  if(!container || !item) return;
  try{
    const key=`${getDashboardGrowthReviewKey(model)}:${model.weather.fetchedAt || ""}`;
    if(dashboardGrowthSimilarityCache?.key!==key){
      dashboardGrowthSimilarityCache={key,index:HarvestGrowthSimilarity.createIndex({samples:model.engineSamples,
        observations:HarvestGrowthObservations.list(),weatherDaily:model.weather.daily,asOf:model.asOf,engine:HarvestGrowthModel})};
    }
    // Limit the explanatory lookup to this opened bed, and preserve each cohort's
    // actual planting/position scope instead of creating one median crop.
    const groups=(item.cohorts || []).slice(0,8).map(cohort=>({cohort,result:HarvestGrowthSimilarity.find({index:dashboardGrowthSimilarityCache.index,input:cohort.input})}));
    const n=formatDashboardGrowthReviewNumber;
    const html=groups.filter(group=>group.result.matches.length).map(({cohort,result})=>`<p><strong>${escapeHtml(cohort.input.plantingDate)}定植・${cohort.palletKeys.length}パレット</strong></p><ul>${result.matches.map(match=>{
      const outcome=match.outcomes[0],size=({small:"小",normal:"並",large:"大"})[outcome?.size] || "不明";
      return `<li>${match.building}号棟${escapeHtml(match.bed)}・${escapeHtml(match.plantingDate)}定植（同じ栽培${match.ageDays}日目で比較）<br>気温差${n(match.differences.temperatureC,"℃")}、${match.differences.lightKind==="sunshine" ? "日照時間差" : "光指標差"}${n(match.differences.light,match.differences.lightKind==="sunshine" ? "時間" : "")}、途中評価の比較${match.differences.fieldPeriods}期間${match.special.length ? `・特殊条件：${escapeHtml(match.special.join("、"))}` : ""}<br>${escapeHtml(outcome?.date || "")}の収穫評価：${size}${outcome?.readyDate ? `／確認した適期日：${escapeHtml(outcome.readyDate)}` : "／適期日：不明"}</li>`;
    }).join("")}</ul>`).join("");
    container.innerHTML=html ? `<p>参考事例です。予測値は変更しません。日照時間が比較できない場合は光指標を使用します。</p>${html}${item.cohorts.length>8 ? "<p>条件の組が多いため、先頭8組を表示しています。</p>" : ""}` : "<p>同じ栽培日数・時期・気温・日照の条件に十分近い過去作はありません。</p>";
  }catch(error){container.textContent="類似作を照合できませんでした。現在の予測は変更していません。";}
}
