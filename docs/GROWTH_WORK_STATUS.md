# 生育予測改善・再開用記録（2026-09-28）

## 現在地

- 公開版: `20260928-growth-release`。ブランチmain。分割ソースからindex.html（64ソース）とApps Script（16ソース）を生成。
- 確定仕様: `GROWTH_REQUIREMENTS.md`。全51節の現在の分類: `GROWTH_REQUIREMENTS_STATUS.md`。
- 計算説明: `GROWTH_PREDICTION.md`。今回6項目と全体の最終コード監査: `GROWTH_FINAL_AUDIT.md`。`GROWTH_SOL_HANDOFF.md` の当初タスクを再実装しない。
- ユーザーは差分実装を明示承認済み。確認を繰り返さない。添付index(5).htmlは対象外。大量UI/CSS追加は最新指示で保留。
- 最初から解析し直さず、この記録とgit diff、対象モジュールだけ確認する。生成物を直接編集しない。

## 今回完了したこと

1. 新旧予測経路の未来補完を禁止。発表・保存日時を持つ実予報だけで未来を計算。取得時刻を発表時刻へ代入せず、予報外/未来欠測は未予測。正常気象キャッシュ24h、手動は端末キャッシュを迂回、staleを24hの成功として扱わない。
2. 適期開始/終了、部分収穫large、位置縮約、範囲不足時fallback、全体/直近/季節/棟別の退化防止を実装。固定88/112%の画面再判定を除去。
3. 採用モデルと品質係数を不変世代に固定。教師変更時だけ評価。気象・EC注釈・手動補正だけで再学習しない。当日収穫が翌日から有効になる署名境界も修正。
4. 方式別バックテスト、同方式を含む凍結世代比較、保存した新旧予測比較を整備。両世代完成前へ係数を戻さない。初期0作baselineの比較、初期8作到達時の新候補、不合格試行の更新で継続学習が止まらないよう防御。
5. 適期優先を方式選択/係数選択まで統一。品質の未予測増加・悪化で見かけの改善を作れない。候補は明示採用までshadow、古い合格署名や別activeに対する合格では採用不可。
6. 任意確認のCAS同期、適期照合、環境・EC・特殊条件の時点付きadapterを接続。明示位置の環境はcohortを分割してその位置だけに適用。農場の既存収穫予定キャッシュは非破壊。
7. 品質の不明/なし/少し/多いと旧あり程度不明、適期日のauto/manual/noneをschema 3で保持。旧サーバー応答で新項目を失わない。
8. 予報/全入力気象/モデル/新旧予測/品質の不変保存。参照ID付き復元、診断専用の失敗分析API。保存予測の評価を3日前へ統一し、分割位置の採点漏れも修正。
9. 安全snapshot/readback、観測・モデルの先行検証マージ、復元journal、容量不足/途中失敗/並行変更/利用者切替時の復旧。採用モデルの復元競合は本人の選択まで保留。元records/settingsは置換しない。
10. ケース数の実苗数・作・部分収穫・完結収穫の照合と時系列評価。混合作や位置へ割当不能な総数は未評価。明示実行APIと既存詳細表示を用意し、気象更新では数量モデルを再fitしない。
11. 既存記録UIに混入していた配置の押下げ、旧チェックと品質状態の不一致、編集取消/種類変更の残留値を修正。追加UIの拡大は停止。
12. 適期開始/終了、3品質の不明/低/注意と計算根拠、今日の確認順、最大3警告、実予報内14日カレンダーを画面へ接続。数量は明示操作時だけ残存ケースの参考値として表示。
13. 候補の3ゲート、明示採用、採用履歴のある世代への巻戻し、復元時の採用競合選択を既存の検証ラッパー経由で接続。
14. JSON統合復元、途中失敗の安全復旧、式注入を防ぐCSV、保存時モデル・気象だけを読む事後診断を接続。現在モデルで過去をすり替えない。
15. 記録タブに未評価収穫のまとめ入力を追加。適期・ベッド別評価・既存品質を保持し、明示した症状だけ更新。手動日数補正はAI値と分離して見通し表示へ適用。
16. 予測変化通知、タブ赤点、既読管理を接続。ベッドカードへ徒長・ばらつき・チップバーンを表示し、14日カレンダーへ開始/期間中/主要品質注意/信頼度を接続。学習済み位置だけの位置差、AI予測と手動補正後の併記、ケース予測幅も表示。

17. ケース係数を世代の補助モデルへ固定し、新旧保存数量・凍結比較・最後の採用非退化ゲート・MAE/bias/coverage/期間を接続。旧世代は変更しない。
18. 途中評価の経過比較と類似作の参考検索を追加。正式教師へ昇格せず、同じ経過日数・当時利用可能な特徴だけ比較。
19. 保存予測の世代/最近/季節/号棟/信頼度別校正レポートと後続作による区間補正検証を追加。教師・日付・地点・世代変更時にキャッシュ更新。High自動昇格なし。
20. 地点・号棟補正の差分選択復元、設定限定journal、元地点を保持する履歴/世代の復元を追加。次作を前作の予測変化として通知する問題も修正。

## 重要な設計判断

- 初期本番はlegacy。候補方式が高度でも、実績で改善を確認し明示承認するまで採用しない。
- 標準評価原点は収穫3日前、最大24時点。JMA予報範囲と整合させる。保存予報なしは採点不能。
- 最低16独立作/5原点/42日。適期→徒長→ばらつき→チップ→サイズの順で比較。数量は最後の非退化確認。データ不足では生育採用を妨げず、数量改善だけで採用候補にしない。
- 気象を再取得しても採用/試行係数は不変。候補の初期更新と不合格後更新は別世代として残す。
- 同じ作の多数パレットを独立データと数えない。旧全ベッド部分収穫から位置を推定しない。
- readyの独立記録は収穫照合で利用。手動補正/途中評価を通常教師へ混ぜない。EC/湿度の未検証係数を作らない。
- 数量は残存ケース数の参考推定。適期の収穫予定数量ではない。部分収穫のplantsPerPalletは平均配分値なので実測株数とみなさない。
- 履歴の自動削除・外部自動送信なし。IDB取り込み後にLSが失敗すると、LSは元bytesへ復旧し、追記済み不変履歴だけ再試行用に保持する。
- 実農場の精度・iPhone実機速度は未実証。症状のリスク開始日は天候条件による参考日であり発症日予測ではない。

## 現在作業中

今回6項目の差分実装・接続・隔離テスト・仕様全体のコード監査は完了。2026-09-28に利用者からコミット・プッシュ・デプロイの明示承認を得た。実農場校正と実機確認は引き続き未実施。

## 未完了（次回の優先順位）

1. 実農場の保存予報が蓄積した後の精度・区間校正、iPhone実機の大量履歴性能と容量確認。
2. 途中評価を正式教師にする実験と、類似作の検索閾値の現場妥当性。現在の安全な検証/参照APIを再実装しない。
3. 収穫前ready単独教師の重複防止を伴う接続。収穫へ引き継いだ確認を二重学習しない。
4. 全ベッドの候補採用影響一覧、根拠付き分割提案、地図/詳細絞込、学習特徴の詳細表示。今回の追加対象外。
5. 本番反映後の実端末での任意記録同期・気象取得の確認。実記録を書き込む検証と実農場校正は公開時の疎通確認とは分ける。

## 主な変更関数と担当ソース

- `07-dashboard.js`: getDashboardGrowthSourceState、buildDashboardGrowthPredictionModel、getDashboardGrowthBedPrediction、loadDashboardGrowthWeather、saveDashboardGrowthHistory、evaluateDashboardGrowthSavedPredictions、exportDashboardGrowthHistory。
- `app/growth-runtime.js`: getDashboardGrowthEngineSamples、getDashboardGrowthEvidenceSignature、prepareDashboardGrowthLearning、getDashboardGrowthFrozenRiskFit、getDashboardGrowthObservationScopes、adoptDashboardGrowthCandidate、rollbackDashboardGrowthModel、restoreDashboardGrowthBackup、recoverDashboardGrowthBackup、getDashboardGrowthYieldAnalysis/Prediction、inspectDashboardGrowthYield。
- `growth-model.js`: fit/predict/backtest、compareGate/selectValidatedMethod/pickParameter、exportModel/hydrateModel。`growth-risk.js`: fit/predict/backtest/係数保存復元。
- `growth-learning.js`: prepare、compareSaved、score。`growth-generation-evaluation.js`: compareFrozen。
- `growth-observations.js`: save/remove/sync/mergeBackup/resolveConflict。`growth-readiness.js`: resolve。`growth-evidence.js`: annotate。
- `growth-management.js`: registerCandidate/adopt/rollback/runWithFallback/mergeBackup。`growth-history.js`: save/get/backupScope/mergeBackup。
- `growth-safety.js`: ensureSnapshot/runMigration。`growth-backup.js`: restore/recover。`growth-analysis.js`: analyzeFailure。
- `growth-yield.js`: buildDataset/currentInput/fit/predict/backtest/exportModel/hydrateModel/compareFrozen/compareSaved/scoreSaved。`growth-planner.js`: quantity/calendar/priority/warnings/changes/adjusted。
- 既存記録経路: 02/09/12/15、Apps Script04と新16。新入力workflowは記録タブから起動。

- `growth-calibration.js`: build/intervalProposal、`growth-field-validation.js`: evaluate、`growth-similarity.js`: createIndex/find。
- `growth-restore-settings.js`: preview/apply/recover/keepCurrent。`app/growth-restore-settings.js`: 元地点scope解決、設定差分UI、無効化/新地点再計算。
- `app/growth-review.js`: refreshDashboardGrowthReview、renderDashboardGrowthReview、showDashboardGrowthYieldValidation、showDashboardGrowthSimilar。
- `07-dashboard.js`: 保存した数量/品質の採点と新旧数量保存、同一作通知識別。`growth-model.js` は補助係数の再export維持だけ追加。

## テスト

- Node生育関連・リレー: **310件成功**（最終一括実行）。モデル200作/24原点はMac上で約1.4秒前後、合成データ。
- ブラウザー/Apps Script特性: **217件成功**。320px/390px・記録/同期/保存・まとめ評価の非破壊更新・通知の重複防止・学習済み位置だけの表示・CSV防御・Worker評価・主要画面の配置を含む。
- IndexedDB実ブラウザー: **9件成功**。不変保存・参照移設・競合時原子的中止。
- ケース世代・途中評価・類似作・校正・地点設定復元・入力時刻・非同期結果の破棄とキャッシュを上のNode件数に含む。
- ソース/生成物一致・同一版・git diff --check成功。

```sh
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test tests/growth-*.test.cjs relay/test/worker.test.mjs
python3 tools/build_all.py
python3 tools/build_all.py --check
python3 tests/run_characterization.py
python3 tests/run_growth_history.py
git diff --check
```

ブラウザー実行は一時プロファイルとlocalhostを使い、実農場データには触れない。nodeは上記パスを利用できる。

## 公開・コミット状態

2026-09-28の「コミットプッシュデプロイして下さい」により、現在のUIを含む変更の公開が承認された。既存Apps ScriptのデプロイIDとWorkerを更新した後、mainへのプッシュでGitHub Pagesへ公開する。既存の旧サーバー対応は保持。公開時は実記録へテストを書き込まず、版・生成物・公開URL・リレーhealthを確認し、実施結果を最終報告する。
