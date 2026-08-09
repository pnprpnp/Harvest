# Apps Scriptの分割ソース

公開・デプロイ対象の `apps-script/コード.js` は生成ファイルです。通常の変更はこのディレクトリ内で行い、リポジトリ直下で次を実行します。

```sh
python3 tools/build_apps_script.py
```

`コード.template.js` が連結順を定義します。生成後は従来と同じ単一の `コード.js` になるため、Apps Scriptのファイル構成、APIの操作名、応答形式は変わりません。

## 担当範囲

- `01-contract-and-schema.js`: 定数、シート名、API上限、列定義
- `02-sync-revision.js`: 同期番号、変更履歴、差分取得
- `03-api-entry.js`: API受付、認証、操作の振り分け
- `04-request-normalization.js`: 受信値の検証と正規化
- `05-write-safety.js`: 書き込み途中の検出、復旧、ロック
- `06-harvest-mutations.js`: 収穫記録の保存、削除、復元
- `07-planting-events.js`: 苗植え記録の保存、取得、削除、復元
- `08-monitor.js`: モニター内容と編集履歴
- `09-harvest-sheet-and-list.js`: 収穫記録の一括保存、シート行、同期一覧
- `10-planting-sheet.js`: 苗植えシート、削除情報、行の読み書き
- `11-record-trash-and-sheets.js`: 収穫記録シート、削除一覧、復元期限
- `12-spreadsheet-connection-and-repair.js`: 接続先スプレッドシート、手動修復
- `13-monitor-sheet.js`: モニター用シートの作成と保存形式
- `14-record-sheet-format.js`: 収穫記録の列、表示形式、行の変換、API応答

番号は現在の連結順を表すため、`コード.template.js`の並びを変更しないでください。

## 確認

生成済みかどうかだけを調べる場合は、次を実行します。

```sh
python3 tools/build_apps_script.py --check
```

`python3 tests/run_characterization.py` では、生成一致を確認してからブラウザ側とApps Script側の同期契約をテストします。
