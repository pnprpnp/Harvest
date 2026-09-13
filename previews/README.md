# UI previews

Run the local preview server from the repository root (Python 3 only):

```sh
python3 tools/serve_preview.py
```

Then open one of these previews:

- <http://127.0.0.1:4173/previews/calculation-settings.html>
- <http://127.0.0.1:4173/previews/harvest-progress-loss.html>

If npm is available, `npm run preview` starts the same server.

Preview pages are isolated from Harvestnavi storage and do not save application data.
