# Harvestnavi record relay

Cloudflare Worker と D1 を使い、記録を高速に遠隔保存してから既存の
Apps Scriptへ転送します。中継サーバーが停止している場合、アプリは従来の
Apps Script直接送信へ自動的に戻ります。

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

## ローカル確認

```sh
npm test
npm run migrate:local
npm run dev
```
