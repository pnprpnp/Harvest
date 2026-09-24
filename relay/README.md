# Harvestnavi relay

Cloudflare Worker と D1 を使い、記録を高速に遠隔保存してから既存の
Apps Scriptへ転送します。中継サーバーが停止している場合、アプリは従来の
Apps Script直接送信へ自動的に戻ります。

同じWorkerで、生育予測に使う気象庁の過去観測値と予報もD1へ保存します。
アプリで一度気象地点を登録した後は、定期処理が気象データを差分更新するため、
更新のためだけに毎日アプリを起動する必要はありません。

## 初回設定

1. `relay` ディレクトリで `npm install` を実行します。
2. `npx wrangler login` でCloudflareへログインします。
3. `npx wrangler d1 create harvestnavi-record-relay` を実行します。
4. 表示された `database_id` を `wrangler.jsonc` へ設定します。
5. `npm run migrate:remote` でテーブルを作成します。
6. 次のSecretを登録します。

```sh
npx wrangler secret put RELAY_TOKEN_SHA256
npx wrangler secret put APPS_SCRIPT_URL
npx wrangler secret put APPS_SCRIPT_TOKEN
```

- `RELAY_TOKEN_SHA256`: 現在のアプリ連携トークンをSHA-256で変換した64文字の値。元のトークンは保存しません。
- `APPS_SCRIPT_URL`: 現在利用中のApps Script WebアプリURL。
- `APPS_SCRIPT_TOKEN`: Apps Scriptの `setupHarvestWorkerApiToken()` で発行する、記録操作だけを許可した制限トークン。

7. `npm run deploy` を実行します。
8. アプリの「Google連携設定」に、発行されたWorker URLを「高速受付URL」として保存します。

## 動作

- Workerは記録をD1へ保存した時点で受付完了を返します。
- Apps Scriptへの転送はレスポンス後に行います。
- 通信失敗時は1分ごとの定期処理がD1の未反映記録を再送します。
- 完了・失敗データは30日後に削除します。
- 同じ受付IDの再送は重複登録しません。
- 気象データは、初回に必要期間を遡って取得し、その後は過去観測値を日ごと、予報を6時間ごとに更新します。
- 気象庁への過度なアクセスを避けるため、地点ごとのD1キャッシュを端末間で再利用します。
- 気象データの取得失敗時は5分後、15分後、以後1時間ごとに間隔を広げて再試行します。
- 過去の日照時間は8時間を基準とする日照係数へ、予報の天気コードは同じ尺度の日照見込みへHarvestnaviが加工します。

## ローカル確認

```sh
npm test
npm run migrate:local
npm run dev
```
