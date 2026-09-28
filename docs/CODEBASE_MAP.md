# Harvestnavi コードマップ

この文書は、毎回リポジトリ全体を読み直さず、変更対象と直接の依存先だけを確認するための索引です。実装と食い違う場合は実装を正とし、担当範囲、主要経路、データの信頼できる元、または必須確認手順が変わったときだけ更新してください。

- 機能ソース確認基準: `9d62e82`（`feat: add durable record relay`）
- 確認時のアプリ版: `20260917-codebase-map`
- 対象: ブラウザー本体、Google Apps Script、Cloudflare Worker中継、生成・テスト手順
- 対象外: 各関数の全仕様、画面文言一覧、変更履歴

## 最初に行う確認

1. `AGENTS.md` とこの文書を読む。
2. `git status --short --branch` でユーザーの未関連変更を確認する。
3. 機能ソース確認基準以降を `git diff --name-only 9d62e82..HEAD` で確認する。未コミット差分は `git diff --name-only` と `git diff --cached --name-only` も確認する。
4. 下の「変更内容から開くファイル」に従い、対象ファイルと直接の依存先だけを `rg` と必要な行範囲で読む。
5. 生成ファイルは編集せず、ソース変更後にビルドして一致を確認する。

基準以降の差分が多くなった場合や、この文書の主要経路が変わった場合は、関連ソースを確認したうえで基準コミットを更新します。単純な文言・スタイル・局所修正だけでは更新しません。

## 全体構成

| 場所 | 役割 | 注意点 |
| --- | --- | --- |
| `src/index.template.html` | ブラウザー版の連結順とアプリ版宣言 | 読み込み順は依存関係でもあるため、番号付きJSの順序を変えない |
| `src/html/` | アプリ本体、タブ、ダイアログのHTML | 公開用HTMLはここを編集する |
| `src/styles/legacy.css` | 従来の基本スタイル | 既存画面への広い影響に注意する |
| `src/styles/unified/` | 画面・機能別の上書きスタイル | UI変更は320px・390pxを優先確認する |
| `src/scripts/browser-storage.js` | `localStorage` / `sessionStorage` の共通窓口 | 他ファイルから保存領域を直接操作しない |
| `src/scripts/growth-model.js` / `growth-risk.js` | 生育予測の学習・時系列評価と症状／気象の関係集計 | DOM・通信から独立した計算。未来の記録・予報の混入と同一作の重複に注意する |
| `src/scripts/growth-history.js` | IndexedDBへの予報・予測スナップショット保存 | 利用者区分と地点を分離し、当時の保存内容を上書きしない。外部へ自動送信しない |
| `src/scripts/growth-learning.js` / `growth-generation-evaluation.js` / `growth-management.js` | 教師変更時の評価、凍結世代比較、shadow、明示採用・巻戻し | 気象更新で再学習しない。同方式の係数更新も両世代完成後だけ比較 |
| `src/scripts/growth-observations.js` / `growth-readiness.js` / `growth-evidence.js` | 任意確認のCAS同期、適期引継ぎ、環境・除外の時点付き照合 | 正解値・途中評価・手動補正を混ぜない。未知位置を拡張しない |
| `src/scripts/growth-safety.js` / `growth-safety-storage.js` / `growth-backup.js` / `growth-analysis.js` | 移行安全、IndexedDBへの安全保存、復元と競合、診断専用の失敗分析 | 元記録のraw値を保持。将来実測を置換するのは診断のみ |
| `src/scripts/growth-planner.js` / `growth-yield.js` | 数量照合・凍結補助係数・新旧数量比較・優先分類・カレンダー | ケース合計を位置へ推測配分しない。数量は上位指標の悪化を覆せない |
| `src/scripts/growth-calibration.js` / `growth-field-validation.js` / `growth-similarity.js` | 保存予測の校正検証、途中評価の経過照合、類似作の参考検索 | 元予測・教師を変更しない。世代/作/時点を分け、不足を精度で埋めない |
| `src/scripts/growth-restore-settings.js` / `src/scripts/app/growth-restore-settings.js` | 地点・号棟補正の明示選択復元と安全保存 | 無選択は現状維持。履歴・モデルの元地点を維持し、現在地点へ混ぜない |
| `src/scripts/app/growth-review.js` | 既存精度詳細への校正・数量・途中評価と類似作の接続 | 記録revision/日付/地点/世代でキャッシュし、画面再表示ごとに履歴を走査しない |
| `src/scripts/app/growth-runtime.js` / `growth-observation-workflow.js` | 上記APIの本番配線・記録タブでの任意入力 | 番号付きスクリプト内の既存フローを置き換えない |
| `src/scripts/app/01-*.js`〜`19-*.js` | ブラウザー本体処理 | 番号が実行順。下記の担当表から必要なものだけ読む |
| `index.html` | 公開用の生成ファイル | 直接編集しない。`tools/build_index.py` で生成する |
| `apps-script/src/` | Apps Scriptの機能別ソース | API、スプレッドシート、差分同期、受信箱の実装元 |
| `apps-script/コード.js` | Apps Scriptの生成ファイル | 直接編集しない。`tools/build_apps_script.py` で生成する |
| `relay/` | Cloudflare Worker + D1の耐久中継 | 記録の受付・再送・状態確認と、気象庁データの定期取得・地点別キャッシュを担当する |
| `tools/` | 連結ビルドとプレビュー | `build_all.py` が両方の生成・一致確認をまとめる |
| `tests/` | ブラウザーとApps Scriptの特性テスト | 実データや実スプレッドシートは操作しない |
| `previews/` | UI調整用の独立プレビュー | UI案の確認用。製品コードの信頼できる元ではない |

## ブラウザー本体の担当

| ファイル | 主な担当・入口 |
| --- | --- |
| `01-core-ui-and-workflow.js` | 定数、保存キー、グローバル状態、共通UI、タブ、作業ナビ、途中状態保存。主状態は `records`、`plantingEvents`、`harvestFillKeys`。 |
| `02-local-data.js` | 設定・収穫記録・苗植え記録・ごみ箱・競合の正規化と端末保存。保存後は `completeRecordDataMutation()` が派生キャッシュを無効化する。 |
| `03-sheet-sync-core.js` | Google連携設定、同期状態、未送信キュー、再送、競合UI、削除要求、受信箱の受付状態確認。 |
| `04-monitor-sync.js` | モニター内容のApps Script送受信、Firebase更新通知、編集中内容と履歴。Firebaseには内容ではなく更新通知だけを置く。 |
| `05-sheet-record-transfer.js` | 収穫・苗植え記録の検証、送信、ページ取得、起動時取込、通知ドット。同期応答の統合入口。 |
| `06-settings.js` | 計算設定とケース配置設定。設定変更時の正規化・保存・関連再計算。 |
| `07-dashboard.js` | 集計、履歴検索、グラフ、収穫予測一覧、生育予測β。生育予測の気象取得はタブ選択後だけ行い、`invalidateDashboardDerivedData()` で派生データを破棄する。 |
| `08-harvest-calculation.js` | パレット状態、収穫可能判定、収穫量予測、ロス、部分収穫控除、選択順。`runHarvestPrediction()` が予測実行の中心。 |
| `09-record-workflow.js` | 記録画面の段階操作、苗数・品質割当、苗ハウス、部分収穫下書き、記録一覧表示切替。 |
| `10-monitor-view.js` | モニター表示用の配置図、指示、メモ、文字サイズ調整。 |
| `11-bed-and-record-form.js` | 圃場・パレット配置図、記録フォーム、実績ロス、苗数差、日付依存表示。 |
| `12-record-save-and-restore.js` | `saveRecord()`、`savePlantingRecord()`、苗植え編集・削除・復元。端末保存後に外部送信をキューへ積む。 |
| `13-partial-harvest.js` | 部分収穫の作成・推定・編集と通常収穫からの分割。 |
| `14-record-history.js` | 収穫記録の編集・削除・復元、整合性監査、履歴表示、バックアップ書出し。 |
| `15-sync-reconcile-and-backup.js` | リモート記録と端末記録の照合、ID付替え、競合作成、バックアップ取込とロールバック。 |
| `16-static-ui-events.js` | `data-ui-*` 属性による共通イベント委譲。 |
| `17-startup-state.js` | 設定・端末データ・途中状態・初期画面の復元。 |
| `18-startup-events.js` | 起動時の入力、スワイプ、モーダル、グローバルイベント登録。 |
| `19-bootstrap.js` | `initializeHarvestnaviApp()` による起動順と失敗時の復旧。 |

## 信頼できる元データと派生状態

- 端末内の収穫記録はメモリー上の `records`、苗植え記録は `plantingEvents` がセッション中の信頼できる元です。永続化は `saveRecordsToStorage()` と `savePlantingEventsToStorage()` から共通保存窓口へ通します。
- 管理者用と作業者用の保存キーは `01-core-ui-and-workflow.js` の `getActive*StorageKey()` 群で切り替えます。役割をまたいで直接キーを指定しません。
- 読み込み時は `normalizeStoredRecord()` と `normalizePlantingEvent()` が旧形式も正規化します。既存データ互換を変える場合はここ、Google受信正規化、特性テストを一緒に確認します。
- 収穫時の育ち具合は収穫記録の `sizeRating` と `growthDetail`、外気は気象庁の観測値・予報が元データです。schemaVersion 3で適期日モード・品質の程度を保持し、旧記録の未確認を症状なしへ変換しません。予測の表示キャッシュは元記録・地点・環境・気象・基準日で無効化しますが、採用係数は世代registryに固定し、気象更新では再学習しません。
- 収穫の品質入力は「育ち具合・品質」に集約し、症状は `growthDetail` の程度から旧同期用の `qualityMemo` タグへ反映します。旧品質メモの自由記述は収穫編集・下書き復元時だけメモ欄へ引き継ぎ、保存するまでは元記録を変更しません。過去の品質メモの詳細表示と、苗植えの品質入力は維持します。
- 当時の予報・予測は `growth-history.js` のIndexedDBが保存元です。現在のモデルを学習し直した結果と区別して採点します。履歴の自動削除・外部送信はせず、保存失敗時に再保存し、必要に応じてJSONへ書き出します。
- 削除済み記録は端末ごみ箱とリモートの削除情報（tombstone）で保護します。単純な配列削除だけで終わらせません。
- `growth-safety.js` の変更前安全保存は、元の保存文字列と画面上の全項目を保持します。新しい安全保存は `growth-safety-storage.js` のIndexedDB `harvestnaviGrowthSafety` / `snapshots` へ置き、トランザクション完了と読戻しを待ってから記録変更へ進みます。従来のlocalStorage内の圧縮・非圧縮v1を優先し、削除・置換しません。64Ki文字以上は同梱のMITライセンス `vendor/lz-string-1.5.0.min.js` で可逆圧縮し、保存前の完全復元確認と保存後の読戻しを行います。再利用時は保存値だけを読み、圧縮・履歴検証を繰り返しません。保存中の元記録・利用者・入力変更を検出した場合は更新を止めます。保存経路の変更時は `tests/run_growth_safety_storage.py` と `tests/record-safety-save.test.cjs` で満杯・中止・更新待ちを確認します。
- パレット状態、履歴表示、集計、収穫検索索引、ロス推定などは派生状態です。元記録変更後は `completeRecordDataMutation()` → `invalidateRecordDerivedCaches()` を通し、必要に応じて `rebuildCurrentPalletLifecycleState()` で再構築します。
- Googleスプレッドシートが営農記録の共有データの最終保存先です。記録用のCloudflare D1とApps Script受信箱は通信失敗に耐える受付・再送層です。気象用D1は気象庁への過度なアクセスを避ける共有キャッシュで、画面はその日別値から積算生育値を導出します。
- 同期識別は収穫記録のUUID・ID・重複キー、苗植えイベントID、更新日時、同期番号を組み合わせます。片側の値だけで上書き判定を追加しません。

## 主要な処理経路

### 起動

`19-bootstrap.js: initializeHarvestnaviApp()`
→ 静的イベント登録
→ `17-startup-state.js` で設定・記録・途中状態を復元
→ 画面初期化
→ `03-sheet-sync-core.js` の未送信キューを復元
→ 入力・集計・グローバルイベント登録
→ 起動画面を閉じる。

### 収穫・部分収穫の保存

`12-record-save-and-restore.js: saveRecord()`
→ 入力と履歴依存を検証
→ 通常収穫と `13-partial-harvest.js` の部分収穫を組み立てる
→ `saveRecordsToStorage()` で端末へ先に保存
→ `completeRecordDataMutation()` で派生キャッシュを無効化
→ `queueGoogleSheetRecordBatchSend()` で耐久送信待ちへ保存
→ UIを次の苗植え工程または履歴へ進める。

### 苗植えの保存

`12-record-save-and-restore.js: savePlantingRecord()`
→ `09-record-workflow.js` の割当・苗数・品質状態を検証
→ `plantingEvents` と収穫記録の苗植え状態を更新
→ 端末へ先に保存
→ 収穫記録と苗植えイベントを同日バッチ送信キューへ積む。

### 外部送信

`03-sheet-sync-core.js` の端末内送信待ち
→ `05-sheet-record-transfer.js` が同日バッチを作成
→ 高速受付URLがあれば `relay/src/worker.mjs` がD1へ保存して即時受付
→ WorkerがApps Scriptの `enqueueDayBatch` へ転送
→ `apps-script/src/15-record-inbox.js` が受信箱へ耐久保存・順次処理
→ `06-harvest-mutations.js` / `07-planting-events.js` が通常シートへ反映
→ クライアントが受付IDで状態確認し、同期状態を確定する。

中継が使えない場合はApps Script直接受付へ戻ります。通信失敗時も端末記録と送信待ちは残します。

### 外部からの取込と競合

`05-sheet-record-transfer.js` が同期番号またはカーソルで差分を取得
→ `15-sync-reconcile-and-backup.js: reconcileGoogleSheetRecords()` がUUID・ID・更新内容・削除情報を照合
→ 端末側の未送信変更と衝突する場合は `syncConflicts` に保存
→ 確定した元記録を保存
→ 派生キャッシュを無効化して必要な表示だけ更新する。

### 収穫可能判定とシミュレーション

`08-harvest-calculation.js`
→ `currentPalletLifecycleState` を記録・苗植えイベントから構築
→ 収穫済み、再定植、定植後ロック、部分収穫実績を索引から判定
→ `calculateHarvestSelectionFromRecords()` が候補を選択
→ `runHarvestPrediction()` が収穫量・ケース数・ロスを計算
→ 記録変更時だけ関連索引を無効化・再構築する。

### 生育予測β

集計の「生育予測」タブを利用者が選択
→ `07-dashboard.js` がメニューで保存した気象庁の予報地域と必要な過去期間をWorkerへ登録
→ `relay/src/worker.mjs` が気象庁の平均・最高・最低気温・日照時間と週間予報を取得しD1へ地点別保存
→ `relay/src/weather-fallback.mjs` が不足項目だけ過去はNASA POWER、今日・未来のJMA予報期間内はMET Norwayで補完し、出所・式・利用可能日時を保持（仕様は `docs/WEATHER_FALLBACK.md`）
→ `getDashboardGrowthSourceState()` がパレット・苗植えイベント・収穫評価を作ごとに対応付ける
→ `growth-evidence.js` が任意確認の対象範囲・期間・利用可能日時を付与する
→ `growth-learning.js` が教師変更時だけ候補を評価し、`growth-generation-evaluation.js` と保存した新旧予測で比較する
→ `growth-management.js` の採用済み係数を復元し、明示承認まで候補をshadowに保持する
→ 既存の収穫予定日を変更せず、現在の進捗、予定日時点の大きさ、適期の目安、実測／予報／推定日数を派生表示する
→ `growth-risk.js` が確認済みの症状と収穫直前の気象条件を集計し、症状の注意を参考値として表示する
→ `growth-history.js` が表示時点の予報・予測を端末へ保存し、当時の予測の採点と書き出しに使う。

気象地点の検索はメニューで操作した時だけです。リレーは予報と直近8日間の観測を更新し、古い欠損も再試行します。アプリは正常取得した端末キャッシュを24時間再利用し、手動更新では取得を試みます。気象庁の実予報範囲外や予報が欠けた未来日は未予測です。過去の欠測補完と未来予測を混同しません。発表日時のない予報に取得日時を代入しません。

アルゴリズム、候補採用条件、データ不足時の扱い、気象の改訂履歴を完全再現できない制約、未デプロイのサーバー変更は `docs/GROWTH_PREDICTION.md` を参照してください。実農場データによる精度改善は、アプリ上の評価または書き出しJSONを `tools/evaluate_growth.cjs` で確認して判断します。

### 過去記録の編集・削除・復元

`14-record-history.js` と `12-record-save-and-restore.js`
→ 苗植え依存と同期競合を確認
→ 対象記録以降だけを計算対象から外して編集
→ ごみ箱・削除情報・外部削除を順序どおり更新
→ 保存後にパレット状態、集計、予測、履歴索引を無効化する。

## 変更内容から開くファイル

| 変更内容 | 最初に開く | 併せて確認する |
| --- | --- | --- |
| タブ、ダイアログ、入力配置 | `src/html/` の該当ファイル | 対応する `src/styles/unified/`、`16-static-ui-events.js`、`18-startup-events.js` |
| UIの見た目 | 該当CSS | 該当HTML、`previews/`、320px・390px表示 |
| 収穫予測・ロス・収穫可能判定 | `08-harvest-calculation.js` | `02-local-data.js`、`13-partial-harvest.js`、関連特性テスト |
| 収穫記録の入力・保存 | `12-record-save-and-restore.js` | `09-record-workflow.js`、`11-bed-and-record-form.js`、`02-local-data.js` |
| 部分収穫 | `13-partial-harvest.js` | `08-harvest-calculation.js`、`09-record-workflow.js`、`14-record-history.js` |
| 苗植え選択・苗数・品質 | `09-record-workflow.js` | `11-bed-and-record-form.js`、`12-record-save-and-restore.js`、`02-local-data.js` |
| 過去記録の編集・削除・復元 | `14-record-history.js` | `12-record-save-and-restore.js`、`15-sync-reconcile-and-backup.js`、依存再計算 |
| Google送受信・未送信・競合 | `03-sheet-sync-core.js`、`05-sheet-record-transfer.js` | `15-sync-reconcile-and-backup.js`、Apps Scriptの対応操作 |
| Apps Script API契約 | `apps-script/src/01-contract-and-schema.js`、`03-api-entry.js` | `04-request-normalization.js`、ブラウザー側の送受信検証、契約テスト |
| Apps Scriptの収穫保存 | `06-harvest-mutations.js`、`09-harvest-sheet-and-list.js` | `05-write-safety.js`、`11-record-trash-and-sheets.js` |
| Apps Scriptの苗植え保存 | `07-planting-events.js`、`10-planting-sheet.js` | `05-write-safety.js`、収穫記録との割当制約 |
| 差分同期番号 | `apps-script/src/02-sync-revision.js` | ブラウザー側カーソル・同期番号、変更履歴シート |
| 高速受付・再送・気象更新 | `relay/src/worker.mjs` | `relay/migrations/`、`apps-script/src/15-record-inbox.js`、ブラウザー側受信箱状態確認、`07-dashboard.js` の気象キャッシュ |
| モニター | `04-monitor-sync.js`、`10-monitor-view.js` | Apps Scriptの `08-monitor.js`、`13-monitor-sheet.js`、Firebase通知 |
| 集計・ダッシュボード | `07-dashboard.js` | `02-local-data.js` のキャッシュ無効化、記録詳細表示 |
| 生育予測・育ち具合評価 | `07-dashboard.js`、`growth-model.js`、`growth-risk.js`、`02-local-data.js` | `growth-history.js`、`09-record-workflow.js`、`12-record-save-and-restore.js`、Google同期・Apps ScriptのgrowthDetail、気象キャッシュ、`docs/GROWTH_PREDICTION.md` |
| 起動・状態復元 | `17-startup-state.js`〜`19-bootstrap.js` | `01-core-ui-and-workflow.js` の途中状態保存 |
| ブラウザー内保存形式 | `02-local-data.js` | `browser-storage.js`、旧バックアップ、取込、同期正規化 |
| ビルド・バージョン | `tools/`、`src/index.template.html`、`version.json` | 生成後の `index.html` と `apps-script/コード.js` |

## 変更時に守る契約

- 通常収穫は `fullHarvest`、部分収穫は `partialHarvest`。現在のパレット番号方式はversion 2です。
- 圃場は2〜9号棟、各棟A〜F、各ベッド78パレットという契約をブラウザーとApps Scriptで共有しています。
- 端末保存を外部送信より先に完了させ、送信失敗は未送信状態として残します。
- 旧記録を正規化して読める状態を維持します。保存形式の変更時はバックアップ取込とGoogle同期も確認します。
- 元記録を変えたら、収穫可能判定、苗植え状態、部分収穫索引、集計、履歴表示のうち影響する派生状態だけを無効化します。
- 表示用丸めを保存値や内部計算へ戻しません。
- API上限、項目名、操作名を片側だけ変更しません。
- `index.html` と `apps-script/コード.js` は生成結果としてのみ更新します。
- コミット時は `version.json`、`src/index.template.html`、生成済み `index.html` の版を同じ値にします。

## 最小確認コマンド

```sh
# 生成ファイル、版、保存窓口、CSS規約の一致
python3 tools/build_all.py --check

# ブラウザー側とApps Script側の特性テスト
python3 tests/run_characterization.py

# Cloudflare中継だけを変更した場合
npm --prefix relay test

# 生育予測・症状分析の計算を変更した場合
node --test tests/growth-*.test.cjs

# IndexedDBの不変保存・参照移設・原子的マージ
python3 tests/run_growth_history.py

# アプリから書き出した実績・気象・予測履歴の再評価（通信不要）
node tools/evaluate_growth.cjs 履歴.json --as-of 2026-09-25 > 結果.json
```

UI変更は特性テストで320px・390pxの収まりを確認します。利用者向けの操作プレビューは「見せて」と依頼された場合だけ用意します。Apps Scriptの `clasp push` とデプロイ、Cloudflare Workerのデプロイは明示依頼がある場合だけ行います。
