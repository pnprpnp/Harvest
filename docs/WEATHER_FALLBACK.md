# 気象データの欠損補完

気象庁（JMA）を主データ源とする。正常な日・項目は代替値で上書きしない。WorkerがJMAを取得してから必要な補完だけを行い、端末はその同じ日別入力から計算と不足表示を導出する。記録転送・Sheets・モデル係数・採用条件は変更しない。

## 優先順位と計算範囲

- 過去：JMA日別の平均・最高・最低気温、日照時間 → 欠けた項目だけNASA POWER → 残る欠損はnull。
- 今日：最新JMA予報 → 保存済みの同日の正常なJMA予報 → 気象庁アメダスの時間別気温を確認 → 必要な項目だけMET Norway。時間別観測と残りの予報を接続した値も「予報による補完」であり、日全体の実測とはしない。
- 未来：JMA予報 → 必要な項目だけMET Norway。対象は最新JMA予報の開始日から最終日まで。内部の欠けた日は補完するが、最終日を延長しない。

計算に必要なのは平均気温と光の指標。最高・最低だけが残って欠けている日は不足項目を表示しつつ計算を続ける。平均気温または光が本当に欠けている日は計算不能で、0・季節平均・固定気温へ置換しない。予定日がJMA予報範囲外なら従来どおり未予測。苗植え日など元記録の不足による判定材料不足も残る。

## NASA POWER：過去専用

日別APIのUTC/LST境界と日本の日付のずれを避けるため、Hourly APIの`time-standard=UTC`を指定し、日本時間0時から23時までの24時間平均値を集める。`T2M_MAX`・`T2M_MIN`の日別値を日本の日付へ直接付け替えず、`T2M`の24個の値から平均・最小・最大を算出する。最高・最低は時間平均の極値であり、観測所の瞬間的な日極値とは異なる推定値。

- 気温：元単位`C`。`meanTemp = mean(T2M[24])`、`minTemp = min(T2M[24])`、`maxTemp = max(T2M[24])`。
- 光：`ALLSKY_SFC_SW_DWN`と`CLRSKY_SFC_SW_DWN`の同じ24時間を合計し、`lightIndex = clamp(1.12 × 全天日射合計 / 晴天時日射合計, 0.3, 1.2)`。
- APIの元単位（確認した応答では`MJ/hr`）・パラメータ名・合計値・式を保持する。同じ既知単位同士の比だけを採用する。日射量を日照時間へ代入しない。この相対日射の指標は既存の晴天係数1.12に合わせた参考値であり、PAR/DLIの測定値ではない。
- 24時間のいずれかが欠けた項目、fill値、未知の単位、UTC以外、晴天時日射合計0は採用しない。気温だけ正常なら気温だけを使う。

格子データとして`estimated:true`と`grid:true`を記録する。NASAには公開の遅れがあり、直近数日の欠損はすぐには埋まらない場合がある。1地点につき最大31日分を1回で取得し、不足区間を順に進める。失敗・未公開の再確認は24時間後。正常なJMA日まで保存し続けず、補完が必要な日だけキャッシュに残す。

## MET Norway：今日・未来の欠損専用

Locationforecastの時刻付き気温を日本時間の日境界で区切り、線形接続した区間の時間加重平均と最小・最大を同じ系列から算出する。正常なJMAの気温は残し、不足項目のメタデータにMET側の3値の組も保存する。混在した場合は`mixedTemperatureSources`で分かるようにする。

- 未来日は24時間分が必要。予報の隣接時刻が6時間を超える区間は使わない。
- 今日の予報が途中から始まる場合、品質区分0のJMA時間別観測を0時から接続する。観測区間・観測から予報への接続に1時間超の穴がある場合や0時の観測がない場合は1日分としない。残り数時間の平均を1日平均として使わない。
- 光：24時間の雲量が揃う場合だけ`lightIndex = clamp(1.12 - 0.6 × 時間加重平均雲量[%] / 100, 0.3, 1.2)`。既存の晴天1.12〜雨天0.52の尺度をつなぐ参考指標であり、日照時間・日射量の実測ではない。当日観測の雲量を架空に作らない。
- 気温の元単位`celsius`、雲量の元単位`%`、式、発表時刻、取得時刻、期間、観測と予報それぞれの時間数を保存する。

アメダスの3時間単位の公開ファイルは今日に必要な場合だけ取得する。過去の時間帯は保存して再利用し、当日の直近時間帯だけ更新する。METの`Expires`を守り、期限後は`If-Modified-Since`を付ける。304では元予報の取得時刻を更新しない。新しいJMA観測と接続する場合、その観測が利用可能になった時刻も保持する。HTTP失敗時は1時間後に再試行する。

## 出所、時点境界、履歴

新しい入力の`weatherPolicy`は`provider-fallback-v1`。既存の観測・予報のフィルタと履歴を維持するため、`source`は`observation`/`forecast`を保ち、`provider:jma`を主データ源として残す。補完を表すのは`fallbackUsed`、`fallbackProvider:nasa-power|met-no`、`fallbackFields`および項目別の`fieldSources`。

各日に`date`、`meanTemp`、`minTemp`、`maxTemp`、`lightIndex`、`estimatedTemperature`、`estimatedLight`、`retrievedAt`を保持する。`jmaValues`と`jmaFieldSources`には補完前の正常値を残す。`fieldSources`に元サービス・単位・式・発表/取得/利用可能時刻があり、JMAが回復すると次の更新でJMA値へ戻る。NASA/METの値をJMA実測へ格上げしない。

補完は取得/利用可能時刻以前の学習・バックテストでは使わず、JMA元値へ戻して判定する。MET発表時刻も原点までに既知であることが必要。NASAが過去の日付に対する値でも、後日の取得を昔から既知とみなさない。症状条件の学習も同じ時点正規化を通し、推定値は確認済み実測の証拠にしない。

旧保存入力には新ポリシーを遡って付けず、従来の計算方法を維持する。保存済み予報・予測・凍結モデルを変更せず、新しいスナップショットを追加する。出所メタデータも既存のバックアップ/復元で保持する。D1・IndexedDBのスキーマ移行は不要。未対応のサーバーキャッシュは次の定期処理で1回更新し、端末の旧キャッシュも初回は再取得する。オフライン時には旧キャッシュを残して使用できる。

代替利用日は既存の推定データの情報重み0.3を使い、1日でも信頼度「中」を「参考値」へ下げる。利用日が増えるほど期間全体の情報重みが下がる。新しい閾値階層は追加しない。画面の詳細に実測/予報/代替日数、補完日・項目・元サービス、残る不足日・項目、取得失敗、出典を表示する。

## 公開条件と出典（2026-09-28確認）

外部通信はWorkerから行い、ブラウザーからNASA/METへの直接アクセスを追加しない。APIキーや新たな継続料金は不要。JMAとNASA POWERの加工表示、MET Norwayの著作者名・ライセンスリンク・加工表示を、補完した画面の詳細に表示する。

- [NASA POWER Hourly API](https://power.larc.nasa.gov/docs/services/api/temporal/hourly/)：UTCとLSTの指定、時間平均値、元解像度。
- [NASA POWER データFAQ](https://power.larc.nasa.gov/docs/faqs/data/)：公開までの遅れ。
- [NASA Earthdata Data Use Policy](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy)：NASA公開データの利用条件と出典。NASAによる製品推奨と誤認させない。
- [MET Norway Terms of Service](https://api.met.no/doc/TermsOfService) / [ライセンス](https://docs.api.met.no/doc/License)：無料の商用利用、CC BY 4.0、識別可能なUser-Agent、キャッシュ、条件付きリクエスト。
- METのUser-Agentは`Harvestnavi/1.0 https://github.com/pnprpnp/Harvest`。座標は小数4桁以下。地点別に端末間でキャッシュを共用し、通常更新は既存の6時間間隔。大規模展開で20リクエスト/秒を超える構成に変更する場合は事前に利用条件を再確認する。

## 確認

`node --test relay/test/*.test.mjs tests/growth-*.test.cjs`、`python3 tools/build_all.py --check`、`python3 tests/run_characterization.py`、`python3 tests/run_growth_history.py`で、JMA優先、3種類の補完、時点境界、出典・不足表示、320/390px幅、信頼度低下、旧履歴の維持と復元を確認する。
