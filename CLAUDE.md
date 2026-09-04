# github-topic-groups

context: hash7ff

Chrome MV3 拡張。GitHub Repository 一覧を `topic-groups-*` Topic ごとにグループ表示する。

- 仕様: docs/Plan.md ／ 実装計画（マイルストーン・決定ログ・検証済み事実）: docs/ImplementationPlan.md
- 最重要要件: 既存 Topics を壊さない（非 `topic-groups-*` Topic を必ず保持）／PAT を Content Script・DOM・ログに出さない／GitHub 標準 UI へ常に戻せる。
- 純粋ロジックは `src/core/`（chrome.* と DOM に触らない）。`npm run check` で typecheck + test + build + トークン隔離チェック。
- 実機確認はホスト Chrome の専用プロファイル（CDP 9224）。9222/9223 は他プロジェクト用なので触らない。
- push・GitHub 上のリモート操作は田中さんがホストで行う。エージェントはローカル commit まで。
