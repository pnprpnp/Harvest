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
| `src/scripts/app/01-*.js`〜`19-*.js` | ブラウザー本体処理 | 番号が実行順。下記の担当表から必要なものだけ読む |
| `index.html` | 公開用の生成ファイル | 直接編集しない。`tools/build_index.py` で生成する |
| `apps-script/src/` | Apps Scriptの機能別ソース | API、スプレッドシート、差分同期、受信箱の実装元 |
| `apps-script/コード.js` | Apps Scriptの生成ファイル | 直接編集しない。`tools/build_apps_script.py` で生成する |
| `relay/` | Cloudflare Worker + D1の耐久中継 | Apps Scriptが最終保存先。中継は受付・再送・状態確認を担当する |
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
- 収穫時の育ち具合は収穫記録の `sizeRating` と `growthDetail` が元データです。生育予測βの気象キャッシュと判定モデルは派生状態で、記録変更または地点変更時に再計算します。
- 削除済み記録は端末ごみ箱とリモートの削除情報（tombstone）で保護します。単純な配列削除だけで終わらせません。
- パレット状態、履歴表示、集計、収穫検索索引、ロス推定などは派生状態です。元記録変更後は `completeRecordDataMutation()` → `invalidateRecordDerivedCaches()` を通し、必要に応じて `rebuildCurrentPalletLifecycleState()` で再構築します。
- Googleスプレッドシートが共有データの最終保存先です。Cloudflare D1とApps Script受信箱は通信失敗に耐えるための受付・再送層であり、画面計算の元データにはしません。
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
→ `07-dashboard.js` がメニューで保存した気象庁の予報地域を読み、気象庁の週間予報を取得
→ 「目安」のパレット別収穫予定日、定植記録、収穫時の `sizeRating` / `growthDetail` を比較
→ 号棟別補正と気温・天気による日照条件の推定から、予定日時点の大きさ、チップバーン・徒長の注意を派生表示する。

気象地点の検索はメニューで操作した時だけ、予報は生育予測タブを開いた時だけ取得します。結果は地点ごとに6時間再利用し、日別値を最大2年分だけ端末に蓄積します。予報期間外は気象庁の平年値を低信頼度の参考値として使います。

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
| 高速受付・再送 | `relay/src/worker.mjs` | `relay/migrations/`、`apps-script/src/15-record-inbox.js`、ブラウザー側受信箱状態確認 |
| モニター | `04-monitor-sync.js`、`10-monitor-view.js` | Apps Scriptの `08-monitor.js`、`13-monitor-sheet.js`、Firebase通知 |
| 集計・ダッシュボード | `07-dashboard.js` | `02-local-data.js` のキャッシュ無効化、記録詳細表示 |
| 生育予測・育ち具合評価 | `07-dashboard.js`、`02-local-data.js` | `09-record-workflow.js`、`12-record-save-and-restore.js`、Google同期・Apps Script収穫列、気象キャッシュ |
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
```

UI変更では上記に加え、プレビューで320px・390pxを優先して確認します。Apps Scriptの `clasp push` とデプロイ、Cloudflare Workerのデプロイは明示依頼がある場合だけ行います。
