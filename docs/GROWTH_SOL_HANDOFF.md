# Solへ引き継ぐ実装タスク（2026-09-28更新）

## 2026-09-28 完了後の状態

- S1完了: 適期期間と誤差範囲を分離し、3品質の不明/低/注意と計算済み理由を表示。
- S2完了: 3種類の検証ゲート、eligible候補の本人採用、採用済み世代への巻戻し、復元時のactive競合選択を接続。
- S3完了: 今日時点の優先分類、最大3警告、実予報内14日カレンダー、元AI値と分離した手動日数補正、前回予測との差分通知と既読管理を接続。
- S4完了: 未評価収穫の個別入力とまとめ入力。品質は既定で変更せず、明示した不明/なし/少し/多いだけ更新。
- S5完了（地点・補正の明示選択を含む）: JSON統合復元、途中失敗の安全復旧、採用競合、CSV、保存時モデル/気象による事後診断を接続。地点は無選択なら維持し、履歴/世代はバックアップの元地点を保って復元する。
- S6確認済み: Node 310件、隔離ブラウザー217件、IndexedDB 9件、生成一致、diff check成功。iPhone実機と実農場データは未確認。
- S7表示接続完了: 利用者の明示操作時だけ、指定範囲の残存ケース数として表示。不明は0にせず、世代の凍結補助モデルと最後の非退化確認を接続済み。データ不足時は非阻害。

以下は当初の受入条件を残す。完了済みの単位を再実装しない。

最初に `GROWTH_WORK_STATUS.md` と `GROWTH_REQUIREMENTS_STATUS.md`、git diffだけを確認する。index.htmlを読み直さず、以下の分割ソースを使う。確定仕様を変更しない。計算をUI側で再実装しない。株重や毎日の適期確認を必須にしない。

## Solで進められる具体的な単位

### S1: 適期期間・根拠・品質の表示

- 対象: `src/html/dialogs/dashboard.html`、`07-dashboard.js` の `getDashboardGrowthLearningBasisHtml` / `renderDashboardGrowthValidation`。
- 入力: 各cohortの `prediction.readyStart/readyEnd/readyWindow/interval/outOfForecast/dayCounts/reasons/confidence`。`interval` は誤差の参考範囲であり適期期間とは別に表示。
- 最低条件: 予定日が予報外でも現在の進捗があれば表示し、予定日時点のサイズは未予測。`readyEnd:null` を翌日や予定日で埋めない。既存の作業予定を変えない。
- 3品質を表示する際は `risk.elongated/uneven/tipburn` を使い、unknownとlowを区別。現時点はreferenceの注意表示。発症確率や栽培対策を追加しない。
- 理由は計算済みの値だけ。低温で何日遅れる等、計算のない説明は作らない。

### S2: 採用候補・世代・巻戻しの操作

- 対象: `growth-runtime.js` の `adoptDashboardGrowthCandidate` / `rollbackDashboardGrowthModel` を呼ぶ画面。
- 表示元: `getDashboardGrowthLearningRegistry().getState()` の generations/evaluation/history、`model.learning.runtime`。
- 方式比較、凍結世代比較 `evaluation.summary.generations`、実際の保存予測比較 `prospective` を別々に表示。学習件数と検証件数を混ぜない。
- 採用ボタンは現在のeligible候補だけ。必ず既存wrapperを使用し、署名・比較対象・両評価の再確認を迂回しない。件数増加だけで自動採用しない。
- 巻戻しは採用履歴のある世代だけ。UIから理由入力を強制しない。復元によるactiveChoice競合は本人の選択まで保留。
- 受入確認: 未検証ボタン無効、採用前はactive不変、教師更新後の古い合格候補を拒否、巻戻し後も履歴保持。

### S3: 手動日数補正・カレンダー・警告・通知

- `growth-planner.js` の adjusted/calendar/priority/warnings/changes を利用。本体へinclude済み。表示側だけ接続する。
- `growthEvidence.manualOffset` を作/位置に一致するcohortだけへ適用。元AI予測は変更せず、表示用結果と分ける。補正して予報最終日を越える日付は未予測。
- priorityの `currentStatus` は「今日」をtargetDateにした推論から取得する。予定日用のstatusを流用しない。気象・係数を再学習しない。
- カレンダーは14日枠でも実予報外は未予測、数量は初適期日に一度だけ計上。数量不明を0ケース扱いしない。
- 警告は3件まで、徒長→ばらつき→チップ。小さい高リスクを収穫優先へ昇格しない。
- 通知は同一作/位置の前回保存と比較。2日以上の変化かlow→highのみ。既読状態は農場記録や教師署名と別の派生状態。
- 数量入力はS7の条件を満たす結果だけ使う。適期判定と残存ケース数を混同しない。

### S4: 記録タブの入力仕上げ

- 対象: `growth-observation-workflow.js`、`src/html/tabs/record.html`。保存は既存 `HarvestGrowthObservations` APIを使用。
- 未評価記録のまとめ入力、位置の選択/解除、既存編集・取消・競合表示を整える。各一括対象を別の元記録として更新し、知らない品質をなしで埋めない。
- 症状程度の観測保存値は unknown/none/low/high、モデル側は unknown/none/slight/many。既存adapterを再利用。
- 適期日モード auto/manual/noneを維持。株重を追加しない。保存失敗と送信失敗を分離。既存の収穫入力途中状態を壊さない。

### S5: バックアップ・復元・診断・CSVの操作

- 出力は既存 `exportDashboardGrowthHistory`。schemaVersion 1の互換出力にrestorationブロックを追加済み。
- ファイル選択→JSON読取→ `restoreDashboardGrowthBackup(payload)`。未完了復元は `recoverDashboardGrowthBackup()`。生データを直接LocalStorageへ代入しない。
- 復元結果の観測競合/世代競合/未適用設定を示す。現在の採用モデルや地点を、バックアップに合わせて自動変更しない。設定復元は確認後に既存の正規化・保存関数を使う。
- 失敗時はrollbackSucceeded/failedKeys/archivesRetainedを説明する。追記済み不変履歴を削除して帳尻を合わせない。
- 診断は保存予測のmodelId/weatherInputIdから `HarvestGrowthHistory.get(id)` で必要時だけ読む。`HarvestGrowthAnalysis.analyzeFailure` にそのsnapshot/input/asOfを渡す。新しいモデルを旧モデルの代わりに使わない。
- CSVは保存値をそのまま列へ出力し、=,+,-,@から始まる文字列の表計算数式解釈を避ける。schema/モデル版/予報範囲/不明を保持する。

### S6: 軽量性と既存画面の確認

- 毎操作の全履歴走査を避ける。既存source/revision/索引を再利用し、表示中の棟/対象だけ再描画。
- 320px・390px、選択解除、キャンセル、保存失敗、同期競合、記録の編集/削除を確認。
- UIプレビューは依頼時だけ。UI最終承認前のコミット・プッシュはAGENTS.mdに従う。生成物はbuild_allだけで更新。

### S7: 検証済み数量APIの接続（依存条件あり）

- `growth-yield.js` の buildDataset/currentInput/fit/predict/backtest を再利用。本体には明示実行用 `getDashboardGrowthYieldPrediction(palletKeys,plantingEventId)` と `inspectDashboardGrowthYield()` を接続済み。記録・任意確認のrevisionでキャッシュする。
- `currentInput` が不明なら実苗数を設定値や平均で捏造しない。混合作の収穫ケースをパレットへ平均配分しない。
- 出力は「指定範囲に残るケース数」であり、未来の指定日に収穫可能なケースとは異なる。生育の適期/実予報範囲と組み合わせるまでは参考値として別扱い。
- 数量モデルの世代連携は完了。新旧保存数量・凍結比較を再実装しない。自動採用へ変更しない。

## UI作業として扱ってはいけない難しい残件

1. 数量の世代連携・MAE/bias/coverage比較は完了。実農場での支持数と予測区間の校正を確認する。
2. 途中評価の経過検証と類似作の参考検索は完了。正式教師化・検索閾値の実データ評価は保留。
3. 収穫前の適期確認だけを単独教師に利用する接続。収穫へ引き継いだ同じ確認との二重学習・同作リークを防ぐ。
4. 実農場のデータでの精度・誤差範囲校正。症状開始日の実測がないため、天候条件の参考日を症状の発生予測へ昇格させない。
5. 実機iPhoneの大量履歴でメモリ/処理時間/保存容量を確認する。現在の性能値はMac上の合成データのみ。

新規の大きなMLライブラリ・外部気象サービス・無断送信・自動デプロイは不要。未完了を見た目で埋めず、比較表の状態を更新してから作業を区切る。

最新6項目の実装内容・意図的保留・必要作数・全体監査は `GROWTH_FINAL_AUDIT.md` を参照。
