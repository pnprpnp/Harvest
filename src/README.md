# index.htmlの分割ソース

`index.html` は公開用の生成ファイルです。通常の変更はこのディレクトリ内で行い、最後にリポジトリ直下で次を実行します。

```sh
python3 tools/build_index.py
```

`src/index.template.html` が全ファイルの連結順を定義します。連結後もCSSとJavaScriptは従来と同じ位置・順番で1つの `index.html` に入るため、公開先や端末の更新処理に追加ファイルは発生しません。

## 担当範囲

- `html/`: ヘッダー、各タブ、ダイアログなどの画面構造
- `styles/legacy.css`: 従来からある基本デザイン
- `styles/unified/`: 機能別の共通デザイン上書き
- `scripts/app-update.js`: アプリ本体の更新と前バージョンへの復元
- `scripts/welcome-paint.js`: 起動画面の初回描画
- `scripts/app/01-*.js` から `19-*.js`: 本体処理。番号は現在の実行順でもあるため、並びを変更しない

本体処理は、共通画面と作業ナビ、端末データ、スプレッドシート同期、モニター、集計、収穫計算、記録、バックアップ、共通操作イベント、起動時の状態復元、機能別イベント、最終起動処理の順に分かれています。

## 確認

`index.html` を直接変更した場合や生成を忘れた場合は、次のコマンドが不一致を報告します。

```sh
python3 tools/build_index.py --check
```

`python3 tests/run_characterization.py` も、ブラウザ動作テストより前に同じ確認を行います。
