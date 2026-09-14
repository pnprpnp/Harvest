# UI previews

Run the local preview server from the repository root (Python 3 only):

```sh
python3 tools/serve_preview.py
```

Then open one of these previews:

- <http://127.0.0.1:4173/previews/calculation-settings.html>
- <http://127.0.0.1:4173/previews/harvest-progress-loss.html>
- <http://127.0.0.1:4173/previews/simulation-calculated.html>（実際の `index.html` を使った計算後画面）

If npm is available, `npm run preview` starts the same server.

Preview pages use preview-only data and do not save application data. The calculated simulation preview loads the actual app HTML, CSS, and JavaScript instead of reproducing the screen separately.
