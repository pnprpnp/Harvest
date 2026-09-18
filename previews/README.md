# UI previews

Run the local preview server from the repository root (Python 3 only):

```sh
python3 tools/serve_preview.py
```

Then open one of these previews:

- <http://127.0.0.1:4173/previews/calculation-settings.html>
- <http://127.0.0.1:4173/previews/harvest-progress-loss.html>
- <http://127.0.0.1:4173/previews/simulation-calculated.html>（実際の `index.html` を使った計算後画面）
- <http://127.0.0.1:4173/previews/record-instant-save.html>（実際の記録画面で即時完了、Googleへの送信完了、本体反映済みへの変化を確認）
- <http://127.0.0.1:4173/previews/dashboard-seedling-days.html?__hncheck=dashboard-seedling-days>（管理者状態の実画面で、記録・集計タブと二次定植の日数順を確認）

If npm is available, `npm run preview` starts the same server.

Preview pages use preview-only data and do not send anything to the production spreadsheet. The instant-save preview temporarily replaces storage on its localhost preview origin and restores the prior values when the page closes. The calculated simulation and instant-save previews load the actual app HTML, CSS, and JavaScript instead of reproducing the screen separately.
