# Harvestnavi

## Firebaseによるモニター更新通知

モニターの内容は従来どおりGoogle Apps Scriptに保存します。Firebase Realtime Databaseには内容を保存せず、変更を知らせる短い更新番号と時刻だけを保存します。

Firebaseコンソールで次の設定を行います。

1. 「Authentication」→「ログイン方法」から「匿名」を有効にする。
2. 「Realtime Database」→「ルール」に次の内容を貼り付けて「公開」を押す。

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "monitorSignals": {
      "main": {
        ".read": "auth != null && auth.provider === 'anonymous'",
        ".write": "auth != null && auth.provider === 'anonymous' && newData.exists()",
        ".validate": "newData.hasChildren(['revision', 'updatedAt']) && (!data.exists() || newData.child('updatedAt').val() >= data.child('updatedAt').val())",
        "revision": {
          ".validate": "newData.isString() && newData.val().matches(/^v1-[a-z0-9-]{3,60}$/)"
        },
        "updatedAt": {
          ".validate": "newData.isNumber() && newData.val() >= now - 60000 && newData.val() <= now + 10000"
        },
        "$other": {
          ".validate": false
        }
      }
    }
  }
}
```

アプリは、モニター表示を開いた時または内容を送信した時だけFirebase SDKを読み込み、端末を匿名で自動ログインさせます。Firebaseに接続できない間は、モニター表示中のみ5分間隔の予備確認へ切り替わります。
