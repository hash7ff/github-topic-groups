# GitHub Topic Folders — 実装計画

- 作成: 2026-09-03 / 対象仕様: [Plan.md](Plan.md) / 状態: 提案（未着手・未決事項は §7）
- 前提モード: `context: hash7ff`（個人プロジェクト。**Chrome ウェブストアで公開予定**。2026-09-03 に田中さん確認）。
  Topic 名に受託クライアント名が載る問題は §6 で別扱い。

## 0. 要約

- Plan.md §34 の優先順位に沿って **M0〜M9 の 10 マイルストーン**に分割。各 M は「Done 条件」と「確認方法」を持つ。
- **M4 完了時点で v0.1 Read-only 版**（§35 の第一目標）。書き込み系は M5 で安全層を先に作り、M6〜M8 で機能を載せる。
- 技術選定（推奨）: **TypeScript + esbuild（唯一の dev 依存）+ Node 22 標準 `node --test`**。フレームワーク・実行時依存なし。
- 検証環境: コンテナ内に Chrome が無いので、**ホスト側 Chrome の専用プロファイルに Load unpacked**（人間ゲート 1 回）。
  受け入れは §33 Case 1〜6 を **使い捨てテストリポ 3 つ**で実施。
- 目安: v0.1 まで **8〜10 セッション**（実測なし、感覚値）。

## 1. 事前検証で確定した事実（2026-09-03 に現物確認）

| 事実 | 計画への影響 |
|---|---|
| `GET /user/repos?affiliation=owner&per_page=100` の一覧レスポンスに `topics` が入る（全件 `has("topics")=true`） | Topics 取得の N+1（§13 の `GET /repos/{o}/{r}/topics` を全リポに）は**不要**。書き込み直前の鮮度確認にだけ使う |
| 田中さんの所有リポは **100 件超（2 ページ目あり）**、うち private 59 件以上。現在 Topic は **0 件** | ページネーション（Link ヘッダ）必須。全件同時表示で 100 行超になる。テスト用に Topic 付きリポを新設する必要あり |
| `PUT /repos/{o}/{r}/topics` は fine-grained PAT で **Administration (write)** が必要（公式ドキュメント確認） | Administration write は**リポ削除もできる強い権限**。拡張側で叩く endpoint を構造的に 3 つに限定する（§3.4） |
| Topic の制約: 小文字英数字とハイフン、**50 文字以下、1 リポ 20 個まで** | `project-`（8 文字）を引いた **表示名部分は 42 文字以下**。日本語名は正規化で空になる → エラー表示。20 個目一杯のリポには追加不可 |
| 公式ベストプラクティス: **書き込み系は 1 秒以上あける・並列にしない**。二次制限は 80 件/分・500 件/時 | Rename/Delete の一括処理は**逐次・1 秒間隔・進捗表示**。8 リポなら約 8 秒 |
| Repositories タブ DOM: `<div id="user-repositories-list" data-hpc>` が存在。フィルタ input は `#your-repos-filter`。全体が `<turbo-frame id="user-profile-frame">` 内。React アプリではなくサーバー描画。1 ページ 30 件＋ `.paginate-container`。**ログイン時も同一と確認（M1、2026-09-03）**。タブは `a[data-tab-item=overview|repositories|projects|packages|stars]` | 挿入アンカーは `#user-repositories-list` の直前の兄弟。タブ切替は Turbo frame → 再マウント必須（M1 で実装・検証済み：タブ 3 往復、戻る/進む、2 ページ目で root は常に 1 つ） |
| `<html data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">`、CSS 変数は `--bgColor-default` `--fgColor-default` `--fgColor-muted` `--borderColor-default` `--bgColor-muted` `--fgColor-accent` `--bgColor-neutral-muted` `--fgColor-danger` 等が現行（旧 `--color-canvas-default` は消滅） | この変数を使えば **Dark/Light 追従は無料**。独自の色定義をしない |
| コンテナ: Node v22.23.2（`node file.ts` の型剥がし動作確認済）、`node --test` 動作、esbuild 未導入、Chrome 無し、playwright-core 1.62 あり | テストは追加ツール無しで走る。E2E はホスト Chrome + CDP（§5.3） |
| 未検証: `chrome.storage.session` の容量上限（Chrome 112 以降 10MB のはず）、`onMessage` の Promise 返却対応 | キャッシュは必要フィールドだけに絞る（100KB 程度）。メッセージ応答は全バージョンで動く `sendResponse` + `return true` 方式にする |

## 2. 設計上の決定（推奨。変更可）

1. **配置**（決定 2026-09-03）: 新規リポ `github-topic-folders`（`~/share/workspace/github-topic-folders/`）。`share` は開発環境テンプレのリポなので混ぜない。
   Git の push・GitHub 上のリモート作成は田中さんがホスト側で行う（エージェントはローカル commit まで）。
2. **言語/ビルド**（決定 2026-09-03）: TypeScript strict（`erasableSyntaxOnly` で Node の型剥がしと互換）。esbuild で `src/` → `dist/` にバンドル。
   content script は IIFE、service worker は `"type": "module"`。実行時依存ゼロ。
3. **MVP の対象ページ**: `github.com/<login>?tab=repositories` で **`<login>` がトークンの持ち主と一致するときだけ**起動。
   他人のプロフィール・Organization ページでは何もしない（Original のまま）。Org は Phase 3。
4. **認証**: fine-grained PAT（Metadata: read ＋ Administration: read/write、対象は "All repositories" 推奨、有効期限あり）。
   `chrome.storage.local` に保存。Content Script には `login` 文字列しか渡さない。
5. **書き込みの安全設計**（§3.4）: 直前 GET → 非 `project-*` を全保持して合成 → 差分なしなら送らない → ジャーナル記録 → PUT。dry-run モードあり。
6. **UI 更新は API 成功後**（Optimistic Update しない。§24 の推奨どおり）。
7. **表示名は Topic から導出**（`project-client-a` → `Client A`、単語ごと先頭大文字）。`OSS` が `Oss` になる等の欠点は許容。
   ローカル別名は Phase 2 の検討事項（§6 機密の項）。
8. **リポの並び**: グループ内は名前順。プロジェクトは表示名順、Ungrouped は最後。件数は MVP から表示（コストほぼゼロ）。
9. **言語カラーの丸**: MVP では言語名テキストのみ（linguist の色表は API に無いため）。Phase 2 で色表を同梱。
10. **UI の言語**: 英語（GitHub UI に合わせる。Plan.md の文言例も英語）。
11. **認証は「Sign in with GitHub」（GitHub App の Device Flow）に切り替える**（決定 2026-09-03。田中さん: 「ユーザーに PAT は厳しい」）。
    client secret も backend も不要で Service Worker から完結。ユーザーはボタン → GitHub のページで 8 文字コード入力 → 承認、の 3 手。PAT 入力は上級者向けの予備として残す。
    順序: M4（Grouped View、読み取り専用トークンで検証）→ **M4.5 認証切替** → M5 以降の書き込みは GitHub App のトークンで検証（App をテストリポ 3 つだけにインストール＝影響範囲の限定）。
    `chrome.identity.launchWebAuthFlow` + OAuth App は code 交換に client secret が要るので単体拡張では不可。※実装時に GitHub 側仕様（Device Flow の有効化、user-to-server token の期限と refresh、`GET /user/installations`）を再確認。
13. **接頭辞は既定 `topic-folders-`、設定で変更可**（決定 2026-09-03、田中さん提案）。`project-` は公開リポだけで `project-management` 6,762 件・`project-template` 1,490 件・`project-euler` 1,335 件が既に使っており、フォルダと誤認するだけでなく「Project 削除」で他人の Topic を消せてしまう。`folder-` も `folder-structure` 413 件で同様。`topic-folders-client-a` は 0 件。名前部分は 36 文字まで。Plan.md の `project-` 表記は「既定接頭辞」の意味で読む。
12. **トークンの扱い**: 本番トークンは田中さん自身のブラウザにしか存在せず、エージェントには渡さない。
    検証用プロファイル（9224）には、読み取り専用マイルストーン（M3/M4）は `.env` の読み取り専用トークン（実リポを壊す余地なし）を使い、書き込み系は M4.5 の Sign in で得たトークン（テストリポ限定）を使う。**PAT を新規に作る作業は発生させない**。

## 3. アーキテクチャ

### 3.1 ファイル構成（Plan.md §26 を TS/esbuild 前提に調整）

```
github-topic-folders/
  manifest.json
  package.json  tsconfig.json  build.mjs        # esbuild スクリプト（watch 対応）
  src/
    core/            # 純粋ロジック。chrome.* も DOM も触らない → node --test で単体テスト
      topic.ts       # project- 接頭辞の判定・表示名⇄Topic 名の変換・正規化・バリデーション
      grouping.ts    # repos → {projects, ungrouped, conflicts}、ソート
      topicsMerge.ts # withProjectTopic(current, project|null)：非 project Topic を全保持
      search.ts      # 名前/説明のクライアント側フィルタ
      types.ts       # RepoSummary, Message 型（content⇄SW の契約）
    background/
      service-worker.ts  # メッセージルーター、キャッシュ、逐次書き込みキュー
      github-api.ts      # fetch ラッパ。公開関数は listOwnRepos / getTopics / putTopics の 3 つだけ
      storage.ts         # token / journal / cache / prefs の薄いアダプタ
    content/
      content.ts     # ページ検出・アンカー探索・冪等 mount・Turbo 再マウント
      content.css    # Primer 変数だけを使う。クラスは gtf- 接頭辞
      ui/            # DOM 生成（textContent のみ。innerHTML 禁止）
        toolbar.ts  project-group.ts  repo-row.ts  dialogs.ts  error-panel.ts  h.ts(要素生成ヘルパ)
    options/
      options.html  options.ts  options.css
  icons/
  scripts/check-token-isolation.sh   # dist/content.js にトークンの storage キーが現れないことを grep で保証
  README.md
```

### 3.2 メッセージ契約（Content Script ⇄ Service Worker）

- 単発: `chrome.runtime.sendMessage({type, ...})` → SW は `sendResponse` + `return true`。
  `auth.status` → `{login|null}` / `repos.list {owner, force}` → `{repos, fetchedAt}` / `repos.setProject {owner, repo, project|null}` → `{ok, before, after, dryRun}` / `options.open`。
- 長時間の一括処理（Rename/Delete/Fix）: `chrome.runtime.connect()` の Port で `progress {done, total, current}` を流し、最後に `result {succeeded[], failed[]}`。
- SW はいつ止められてもよいように**メモリ状態を持たない**。キャッシュは `chrome.storage.session`（TTL 5 分、Refresh ボタンで強制更新）。

### 3.3 ページ統合（§5, §18, §19）

- 起動条件: `location.pathname === "/" + owner` かつ `?tab=repositories`、かつ `owner === login`。
- DOM から読むのは **owner（URL）と `#user-repositories-list` の位置**の 2 つだけ。リポ情報は API 由来のみ。
- マウント: `<div id="gtf-root" data-gtf-url="...">` をアンカーの直前に挿入。Original 一覧は `hidden` 属性で隠すだけ（削除しない）。
- 再初期化: `document` の `turbo:load` / `turbo:frame-load` / `turbo:render` と `popstate`、加えて `turbo-frame#user-profile-frame` の MutationObserver（debounce 100ms）。
  `#gtf-root` が存在し `data-gtf-url` が現在 URL と同じなら何もしない（冪等）。アンカーが見つからなければ何もしない（GitHub 側 DOM 変更時のフェイルセーフ）。

### 3.4 書き込みアルゴリズム（§13, §24 の最重要要件）

```
setProject(owner, repo, project | null):
  current = GET /repos/{owner}/{repo}/topics          # 一覧キャッシュは古い可能性があるので直前に取り直す
  next    = withProjectTopic(current, project)        # 非 project-* を元の順序で全保持し、project を末尾に 1 つだけ
  if setEquals(current, next): return {ok, unchanged}
  if next.length > 20: return error("topic limit")
  journal.push({ts, owner, repo, before: current, after: next})   # storage.local、直近 200 件。事故時の手動復旧用
  if dryRun: return {ok, dryRun: true, before, after}
  PUT /repos/{owner}/{repo}/topics {names: next}
  cache.patch(repo, next)
```

- `github-api.ts` は **GET 2 種と PUT 1 種以外のメソッド・パスを持たない**（Administration write を持つトークンで DELETE 等が絶対に飛ばない構造）。単体テストで fetch モックに対し「PUT のボディが非 project Topic を全て含む」「他のメソッドが呼ばれない」を検証。
- 一括処理は逐次・1 秒間隔。途中失敗しても続行し、最後に成功/失敗を一覧表示、失敗分だけ Retry。
- Archived リポは PUT が 403 になるので Move メニューを無効化（ツールチップで理由）。

## 4. マイルストーン

| M | 内容 | Done 条件 | 確認方法 |
|---|---|---|---|
| M0 ✅ 2026-09-03 | スキャフォールド：リポ作成、package.json、esbuild ビルド、tsconfig、最小 manifest（MV3 / `storage` / host `https://api.github.com/*` / content_scripts `https://github.com/*` / options_ui）、CLAUDE.md（context 宣言・この計画への参照） | `npm run build` で `dist/` 生成、`npm test` が空テストで緑、Chrome で Load unpacked がエラーなし | 手動 |
| M1 ✅ 2026-09-03 | Hello World 挿入：URL 判定、アンカー探索、`#gtf-root` バッジ挿入、Turbo 再マウント、冪等性 | Overview⇄Repositories を往復しても root が常に 1 つ。ログイン時 DOM がログアウト時と同じか記録 | CDP（9224）でタブ 3 往復・戻る/進む・2 ページ目を自動確認。root=1、console エラーなし、DOM 同一 |
| M2 ✅ 2026-09-03 | Options ページ（PAT 保存・Test connection・Clear・必要権限と公開性の注意書き）、SW のメッセージルーター、`github-api.ts` の fetch ラッパ（ヘッダ・エラー整形・rate limit ヘッダ読取） | content に "Connected as mutsuyuki" が出る。`scripts/check-token-isolation.sh` が緑 | 手動 + grep スクリプト |
| M3 ✅ 2026-09-03（実データ 109 リポ・2 ページ・キャッシュ動作） | 一覧取得（ページネーション・session キャッシュ）と純粋ロジック（topic.ts / grouping.ts / topicsMerge.ts / search.ts）＋単体テスト | `npm test` 緑（§33 Case 1・3 を単体で再現、日本語名・42 文字超・20 個上限・conflict 検出）。SW ログに実アカウントの件数（100 件超） | `node --test` |
| M4 ✅ 2026-09-03（Case 1・Case 6 合格、`v0.1.0-readonly`） | **Grouped View（Read-only, v0.1）**：ツールバー（Grouped/Original・Search・Refresh）、折りたたみ＋状態保存、リポ行（名前リンク・Public/Private・説明・言語・更新時刻）、Ungrouped、Conflict 警告表示、エラーパネル（Retry / Show original）、Primer 変数でテーマ追従 | §33 **Case 1**、**Case 6**（無効トークンで API 失敗 → Original に戻せる）、Dark/Light 切替で崩れない、console エラーなし。`git tag v0.1.0-readonly` | テストリポ 3 つ + 手動 |
| M4.5 ✅ 2026-09-03 | **Sign in with GitHub**（GitHub App「Topic Folders」= hash7ff Org 所有、App ID 4816822、Client ID `Iv23libmJNxKgFpkRMAF`、slug `topic-folders`、Device Flow 有効、期限 ON）。Options でコード表示 → github.com/login/device → 承認。ポーリングは Options ページが時間を管理し SW は 1 回分だけ処理（SW 寿命問題を回避）。トークンは `gtf.auth`（kind: pat / github-app、refresh 付き）に保存、期限 60 秒前に client_id + refresh_token だけで自動更新（client secret 不要を実機確認）。`GET /user/installations` で未インストール検出 → Install 導線。PAT は Advanced に格下げ | 実機: サインイン成功、`App installed (1 account, repositories: selected)`、期限を過去に書き換えると透過的に更新されトークン/更新トークンが両方ローテート。**発見**: 「Only select repositories」でも**公開リポは読み取り専用で全件含まれる**（GitHub 仕様）→ 3 リポ選択で 46 件表示（公開 43 + 選択 3）。未選択の非公開だけ隠れる。公開リポへの書き込みは失敗する想定（M5 で確認、ユーザーには All repositories を推奨） | CDP `scripts/dev/verify-m45-*.cjs` |
| M5 ✅ 2026-09-03（dry-run / Case 2 / Case 3 / 変更なし / 接頭辞違い拒否 / 一括 1 秒間隔 / ジャーナル、実リポ 3 つで確認、Case 1 に復元） | 書き込み層：`setProject`、ジャーナル、dry-run、逐次キュー（Port で進捗）、fetch モック単体テスト | dry-run で計画ペイロードが正しい → 実 PUT でテストリポの Topics が期待どおり（`gh api` で確認）。**Case 3 の「python/backend が消えない」**を単体 + 実機で確認 | `node --test` + `gh api /repos/{o}/{r}/topics` |
| M6 ✅ 2026-09-03（Case 2 / Case 3 を UI から確認、初回警告、一括作成、復元） | Move to…（既存 Project / Ungrouped / New project…）、New Project ダイアログ（表示名 → Topic 名プレビュー・バリデーション・初回の公開性警告・リポ 1 件以上選択）、成功後に再取得して再描画 | §33 **Case 2**、**Case 3** | 手動 + `gh api` |
| M7 ✅ 2026-09-03（Case 4 / Case 5、確認文、失敗分 Retry ボタン） | Project Rename / Delete（確認ダイアログに件数、逐次実行、進捗、成功/失敗一覧、失敗分 Retry） | §33 **Case 4**、**Case 5**。途中失敗時に UI が嘘をつかない（成功分だけ反映） | 手動（失敗はネットワーク切断で再現） |
| M8 ✅ 2026-09-03（競合を意図的に作って Fix、無関係 Topic 保持） | Conflict の Fix（複数 `project-*` から 1 つ選ぶ）、エラー分類（401 → 設定へ誘導 / 403 → `x-accepted-github-permissions` の内容を表示 / 404 / 422 → GitHub のメッセージ / rate limit → 待機案内 / offline） | 各エラーを故意に再現して文言確認（読み取り専用トークンで書き込み → 403 表示） | 手動 |
| M9 ✅ 2026-09-03（README 最終化、manifest 0.1.0、`v0.1.0` タグ。アイコンは仮のまま）→ Codex レビュー対応で **v0.1.1**（§5.5） | 仕上げ：アイコン、README（Load unpacked 手順・PAT の作り方と権限・Topic 公開性の注意・拡張が絶対にやらないこと・制限事項）、§33 全 Case の受け入れ記録 | §33 Case 1〜6 を日付付きで記録。`git tag v0.1.0` | チェックリスト |

Phase 2（v0.1 を実際に使ってから判断）: Drag & Drop（Move メニューは残す）、複数選択の一括 Move、Public/Private・言語フィルタ、linguist 色表、
ローカル別名（§6 参照）、Organization ページ対応（DOM を先に現物確認。fine-grained PAT は Org 側の許可ポリシーが必要）。Phase 3: Global Dashboard。

**ストア公開（Phase 2 の一部として別マイルストーン化）**: GitHub App Device Flow 認証（§2-11）、Chrome ウェブストア開発者登録（初回 5 USD）、
プライバシーポリシー URL（hash7ff.com 配下）、single purpose 説明、権限ごとの正当化文（`storage` / `github.com` / `api.github.com`）、
データ使用の開示（トークンはローカル保存・送信先は GitHub のみ）、スクリーンショット 1280×800、英日のリスティング。リモートコードは無い（MV3 要件）。
build-in-public の観点では、リポを最初から公開（MIT）にする選択肢もある（田中さん判断）。

## 5. テスト戦略と受け入れ手順

### 5.1 単体テスト（毎 M で実行、追加ツール不要）
- `src/core/**/*.test.ts` を `node --test` で実行。対象: 正規化（`Client A`→`project-client-a`、`My OSS`→`project-my-oss`、全角/日本語/記号/連続ハイフン/先頭ハイフン/43 文字）、
  grouping（Case 1、conflict、Ungrouped 最後、名前順）、merge（非 project Topic の完全保持・重複排除・20 個上限）、search。
- `github-api.ts` は `fetch` を注入して、送信メソッド/パス/ボディを検証。

### 5.2 受け入れ（§33）— 使い捨てテストリポ
- private リポ 3 つ: `gtf-test-api` / `gtf-test-frontend` / `gtf-test-firmware`（§33 の名前に合わせる）。**作成は外向きアクションなので田中さんの承認後**（承認があれば `gh repo create --private` で作る）。
- 初期状態は `gh api -X PUT /repos/mutsuyuki/gtf-test-api/topics` 等で Case 1 のとおりに Topic を投入。`gtf-test-api` には `python` `backend` も付けて Case 3 に備える。
- 実アカウントの本番リポには v0.1 完了まで書き込まない。

### 5.3 実機確認（ホスト Chrome、CDP 9224）— 2026-09-03 接続確認済み
- ホスト側の `share` ディレクトリ: `/home/mutsuyuki/@sync/@study/SelfProject/github-topic-folder/`（Load unpacked の対象は `.../workspace/github-topic-folders/dist`）。
- コンテナには Chrome が無く、コンテナからホストのプロセスは起動できない。**この拡張専用の Chrome プロファイルを田中さんがホスト側で起動**（CDP ポート 9224。9222/9223 は他プロジェクト用なので触らない）。
  接続確認: Chrome 152 / CDP 1.3。Chrome が再起動された時は田中さんが再度起動する。
- 人間ゲート（各 1 回）: そのプロファイルで `chrome://extensions` → Developer mode → Load unpacked で `dist/` を指定 → GitHub にログイン → Options の「Sign in with GitHub」で承認（コード入力）。App のインストール範囲はテストリポ 3 つ。
  ※ブランド版 Chrome は 137 以降 `--load-extension` フラグを無視するので Load unpacked が唯一の方法。読み込んだ unpacked 拡張はプロファイルに残る。
- 以降はコンテナから playwright-core `connectOverCDP('http://localhost:9224')` で `?tab=repositories` を開き、スクショと `#gtf-root` の存在・グループ見出しを確認する。
  再ビルド後の拡張リロードは **CDP で `chrome://extensions` を開き `chrome.developerPrivate.reload(id)` を呼ぶ**（2026-09-03 動作確認済み。カード上の再読込ボタンは Chrome 152 の shadow DOM に見つからなかった）。
  拡張 ID は**名前 + `location === "UNPACKED"` で毎回解決する**。`/json/list` の chrome-extension:// ターゲットから推測してはいけない（別のストア拡張を 2 回再読込する事故があった）。
  スクリプトは `scripts/dev/` に置く（ext-reload.cjs / verify-*.cjs）。
- 代替案（不採用・記録のみ）: コンテナ内に Playwright の Chrome for Testing を入れて X11 でホスト画面に出す方法も可能（不足 apt パッケージは `libnss3 libnspr4 xvfb` とフォント類のみ）。専用プロファイルの運用が既にあるので今回は使わない。

## 5.4 受け入れ記録（Plan.md §33、2026-09-03、実リポ mutsuyuki/gtf-test-* にて）

| Case | 内容 | 結果 | 確認手段 |
|---|---|---|---|
| 1 | api/frontend が Client A、firmware が Ungrouped | ✅ | `scripts/dev/verify-m4-grouped-view.cjs` |
| 2 | firmware を Client A へ Move → Ungrouped が消える | ✅ | `verify-m6-move-new.cjs`（UI 経由）、`verify-m5-writes.cjs`（API 層） |
| 3 | api を Client B へ Move しても python/backend が残る | ✅ | 同上。GitHub API で `["backend","python","topic-folders-client-b"]` を確認 |
| 4 | Client A → Customer A の Rename で全リポの Topic が置換 | ✅ | `verify-m7-rename-delete.cjs` |
| 5 | Project 削除でリポは残り Topic だけ外れて Ungrouped へ | ✅ | 同上。`GET /repos/.../gtf-test-firmware` が 200 |
| 6 | API 失敗時に GitHub 標準表示へ戻せ、標準表示を壊さない | ✅ | `verify-m4-grouped-view.cjs`（無効トークンで 401 → Retry / Show original） |
| 追加 | 複数フォルダ Topic の競合検出と Fix（§25） | ✅ | `verify-m8-conflict.cjs` |

## 5.5 Codex レビュー対応（2026-09-03、`codex exec -m gpt-5.6-sol -c model_reasoning_effort=max`、全文は docs/reviews/2026-09-03-codex-gpt-5.6-sol.md）

12 件の指摘を精査し、妥当なものだけ採用した（v0.1.1）。

| 指摘 | 判断 | 対応 |
|---|---|---|
| GET→PUT 間の外部編集で Topic が消えうる | 妥当だが API 上解決不能（If-Match 非対応） | 直前 GET と期待状態の照合で窓を最小化し、README とプライバシーポリシーに限界として明記 |
| storage.local は既定で Content Script から読める | 妥当 | SW 起動時に `chrome.storage.local.setAccessLevel(TRUSTED_CONTEXTS)`。Content Script 世界から DENIED を実機確認 |
| メッセージ送信元を区別していない | 妥当 | 送信元を options / content に分類。認証・ジャーナルは options 限定、接頭辞・dry-run 変更も options 限定、書き込みは owner === login を必須化、形の検証と一括上限 500 |
| 書き込みが確認時の状態に束縛されていない | 妥当 | 各項目に `expect`（UI が見ていたフォルダ Topic）を持たせ、直前 GET と不一致なら `stale` で中断。設定は一括処理の開始時に 1 回だけ読む。競合リポは New project の選択肢から除外 |
| 更新中のサインアウト/PAT 保存を refresh が上書き・失敗時に無条件クリア | 妥当 | 更新完了時に認証情報が開始時と同一か確認してから保存。ネットワーク/5xx/レート制限では消さず、401/403 の確定失敗のみクリア。単体テスト追加 |
| プライバシーポリシーが実装と不一致 | 妥当 | ジャーナル・ログイン名キャッシュ・installations エンドポイント・接頭辞可変・Limited use を追記 |
| 書き込みの直列化が Port 単位、Retry-After 無視 | 妥当 | SW 全体で 1 本の書き込みキュー（1 秒間隔）。一括中にレート制限/401 が出たら残りを中断 |
| 変更なし判定でキャッシュが古いまま | 妥当 | 直前 GET の結果で常にキャッシュを更新 |
| 書き込み失敗時に GitHub 標準表示へ戻すべき | **不採用** | §24 は読み込み失敗の規定。データは有効で切替ボタンも常にあるため、自動で Original に飛ばす方が体験を損なう |
| Turbo 遷移で旧ビューが生き残る・ダイアログが残る | 妥当 | モジュール変数で唯一の生存ビューを管理し、遷移時に dispose（ダイアログ全閉、読み込みの世代番号で古い応答を捨てる） |
| 一括処理が SW 終了に耐えない | **保留（Phase 2）** | Port 通信中は SW が延命される。300 件級の運用が現実になったら per-item 永続化と再開を実装 |
| MutationObserver が全ページ・全サブツリー | 妥当 | `turbo-frame#user-profile-frame` があればそれだけを監視、無ければ body の直下のみ |

**副次的な発見**: GitHub の一覧 API（`/user/repos`）の `topics` は、Topics 書き換え直後しばらく古い値を返すことがある（M8 復元直後に競合が残って見えた）。`expect` 照合がこのケースを正しく拒否した（「今は Ungrouped。何も書いていない」）。検証スクリプトは一覧 API と topics API が一致するまで待って開始するようにした。

## 5.6 Phase 2 の取捨選択（2026-09-04、田中さんと合意）

v0.1.1 の後、田中さんの判断で以下を確定した。

| 項目 | 判断 | 根拠 |
|---|---|---|
| GitHub 純正フィルタの尊重 | **実装済み（0.2.0）** | Grouped 表示中に上部の検索窓が効かず壊れて見える実害。URL の `q` / `type` / `language` / `sort` を読むだけで、独自フィルタ UI も不要になる |
| アイコン | **実装済み（0.2.0）** | `assets/icon.svg` を作成し `scripts/render-icons.mjs` で 5 サイズを生成。旧アイコンは仮画像だった |
| スクリーンショット | **暫定（0.2.0）** | `scripts/capture-screenshots.mjs` で 1280×800 を 3 枚。実リポ分類後に撮り直す |
| 言語の色丸 | **実装済み（0.2.0）** | linguist の色表 692 件を同梱（17KB）。`scripts/generate-language-colors.sh` で再生成可能 |
| 既存プロジェクトへの複数一括移動 | **実装済み（0.2.0）** | 「新規プロジェクト」画面で既存名を入れれば同じ書き込みになるが、入口の名前が「新規」なので発見できない＝機能不足ではなく導線の欠陥だった。プロジェクトの「…」に「Add repositories…」を追加し、全選択・絞り込みも付けた |
| 並び順・入れ子 | **設計だけ残す** | Topic 名に符号化するしかなく、一度使い始めると取り消せない。`src/core/topic.ts` に拡張点をコメントで明示（変換は 2 関数に集約済みで、UI と書き込み経路は Topic 文字列を解釈しない） |
| ドラッグ&ドロップ | **不採用** | 現状 2 クリックで足りる |
| 全 Organization 横断ダッシュボード | **不採用** | 各 Organization 内で整理できれば十分 |
| Organization 対応 | 公開後の着手候補（§5.7 に実地調査） | API はほぼ無償。ページは React だが意味論的な足場と soft-nav イベントが在り、当初評価ほど高くない |
| ローカル別名 | 保留 | 匿名 Topic（`topic-folders-c01`）の表示名をブラウザ内に持つ案。同期しないので PC を変えると符号のまま |
| 一括処理の再起動耐性 | 保留 | Port 接続中は Service Worker が延命される。実測 1 件約 1.3 秒なので 109 件で約 2 分。初期整理で落ちなければ不要 |

## 5.7 Organization 対応の実地調査（2026-09-04）

「自分が管理する Org だけで良いか」「大変か」を判断するために現物を確認した。

**権限（自分の Org と外部 Org で実装は同一、成否だけが違う）**
- 自分がオーナーの Org: 自分で App をインストールできる → 読み書きとも可能。
- 外部の Org（メンバー）: インストールはオーナー承認が必要で、メンバーには「Request」しか出ない（GitHub 公式ドキュメントで確認）。承認まで非公開リポは見えず、書き込みも不可。さらに Topics の変更にはそのリポの admin 権限も要る。
- 実測（2026-09-04、App を `hash7ff` Org に未インストールの状態）: 公開 Org リポの Topics 取得は 200 で成功、**書き込みは 403 `Resource not accessible by integration`／`x-accepted-github-permissions: administration=write`**。※取得した値をそのまま書き戻す無害な試行で、内容は変えていない。
- 結論: 「自分の Org だけ」に絞っても実質失うものは無い。外部 Org はどのみち「インストールを依頼してください」の表示になる。

**技術的な難所はページ側（2026-09-04 に実測して当初評価を訂正）**

当初「安定した足場が存在しない」と書いたのは**誤り**だった。id と `data-testid` しか見ておらず、ARIA と見出しを確認していなかった。実測した事実:

- **足場は在る（意味論的なもの）**: `main section`（`aria-label` は選択中のビュー名。既定は "All" なので**文字列 "All" で一致させてはいけない**）、`aside[aria-label="Repository filters"]`、`search[aria-label="Search repositories"]`、sr-only の `h2`「Repositories list」、`[id$="-list-view-container"]`、`ul[class^="ListView-module__ul"]`。`q` や `type` を変えても、これらは変わらなかった。
- **挿入したノードは React の再描画と soft navigation を生き延びる**: `<section>` の兄弟として差し込んだ要素は、フィルタ変更後も戻る操作の後も残っていた（React は自分が作っていないノードを消さない）。
- **消えるのは「隠した」状態のほう**: 一覧コンテナは再描画のたびに**別要素に作り替えられる**ので、`hidden` 属性は失われる。隠す処理は再描画ごとに当て直すか、安定したセレクタに対する CSS で行う必要がある。
- **遷移の signal は在る**: このページは Turbo ではないが、GitHub は **`soft-nav:start` / `soft-nav:end`** というイベントを発火し、`history.pushState` と `popstate` も観測できた。個人ページの `turbo:*` に相当する再マウントの契機として使える。

したがって残るコストは「足場探し」ではなく **SPA のライフサイクル対応**（再描画ごとの再適用と soft navigation での再マウント）であり、当初見積もり（ページ側 2〜3 セッション）は**過大**。1〜2 セッション程度が妥当。

**共通化の余地（2026-09-04 実測）**

実装コードの行数（テスト除く）: `src/core` 1,166 / `src/background` 668 / `src/content/ui` 640 / `src/content/content.ts` 371 / `src/options` 176 / その他 34。
このうち**ページ固有なのは `content.ts` の約 40 行だけ**（`ANCHOR_ID` 定数、`detectRepositoriesPage`、`anchor.hidden` の 2 箇所、末尾のイベント登録と MutationObserver）。
グループ化・ダイアログ・書き込み・フィルタ・認証はすべてページに依存していない。

したがって Org 対応は「2 セット目のアプリ」ではなく、**ページアダプタ 1 枚の追加**で足りる:

```
src/content/pages/
  types.ts        PageAdapter = { detect(href), findAnchor(), setNativeListHidden(b), onNavigate(cb) }
  userProfile.ts  現行実装（#user-repositories-list / turbo:* / popstate）
  orgRepos.ts     新規（main section / soft-nav:start,end / 再描画ごとに非表示を当て直す）
```

`content.ts` は URL でアダプタを選ぶだけ、UI とダイアログは無改変。API 側は `listOwnRepos()` → `listRepos(owner)`（`/orgs/{org}/repos`）と、書き込み時の owner チェックを「login と一致」から「`/user/installations` に含まれる account」へ広げるだけ。新規はアダプタ 80〜120 行程度の見込み。

**権限モデル（公式ドキュメントで確認）**: user access token は「App が持つ権限」と「その人自身が持つ権限」の**積**。App を Org に入れても、本人がそのリポの admin でなければ Topics は変更できない。自分の Org ではオーナーなので問題ない。
なお App 未インストールの Org でも**公開リポは読める**ので、中途半端に一部だけ表示することは可能。混乱を招くので「この Organization にインストールしてください」の表示に倒すのが妥当。

**戦略的な含意**: Org ページが既に React で個人ページがまだサーバー描画ということは、GitHub が移行途中である可能性が高い。個人ページが React 化されたとき、現在の足場は消える。その場合この拡張は「何もしない」だけで GitHub の操作は壊さない設計（§19）だが、機能は止まる。DOM 依存を最小に保つ現方針の妥当性を裏づけると同時に、いずれ React ページへの差し込み手法が必要になることを示す。

## 6. リスクと対策

- **GitHub 側 DOM 変更**（最大の保守リスク）: 依存を `#user-repositories-list` の位置と URL だけに絞る。アンカーが無ければ何もしない。ログイン時 DOM は M1 で最初に確認する（今回の確認はログアウト時のみ）。
- **Topic の全置換 API で他 Topic を消す事故**: 直前 GET → 全保持合成 → ジャーナル → PUT。fetch モック単体テストで PUT ボディを検証。dry-run で先に確認。
- **Administration write の強さ**: API ラッパの公開関数を 3 つに限定。README に「リポ削除 API は存在しない」と明記。PAT には有効期限を付ける。
- **Topic 名は private リポでも公開**（§16）: 初回警告に加え、**受託クライアントのリポには最初から `project-c01` のような匿名コードを使う**ことを推奨する。
  これは田中さんの freelance モード（機密厳守）に直接効くので、Phase 2 の「ローカル別名（匿名 Topic → 表示名の対応を `chrome.storage.local` に保存）」を早めに検討したい。
  別名は所属情報ではなく UI 設定なので §3.1（Source of Truth は Topics）には反しないが、PC 間で同期しない欠点がある。
- **鮮度**: 一覧キャッシュは最大 5 分古い。書き込みは常に直前 GET で守る。表示は Refresh で更新。
- **MV3 service worker の停止**: 状態は `storage.session` に置く。長い一括処理は Port を開いたまま進める（Port 接続中は SW が生き続ける）。
- **Rate limit**: 読み取りは 5,000/時で十分。書き込みは逐次 1 秒間隔。429/403 の `retry-after` を尊重。
- **Archived リポ**: 書き込み不可。UI で Move を無効化。
- **fine-grained PAT と Organization**: Org が fine-grained PAT を許可していないと Org リポに届かない → Org 対応（Phase 3）時の主要リスク。

## 7. 決定ログと残る確認事項

決定（2026-09-03、田中さん回答）:
1. 配置: `~/share/workspace/github-topic-folders`。リモートは **`hash7ff/github-topic-folders`（公開、MIT）**。GitHub Organization `hash7ff` は 2026-09-03 作成（会社として出す決定）。push とリモート作成は田中さんがホストで行う。サイトは GitHub Pages（`site/` を Actions でデプロイ）。
2. TypeScript 採用。
5. 実機確認はホスト Chrome の専用プロファイル（CDP 9224）。田中さんが起動済み。
6. 個人プロジェクト（context: hash7ff）。Chrome ウェブストアで公開予定 → §2-11 の認証ロードマップとストア公開マイルストーンを追加。

残る確認事項:
3. **テストリポ 3 つ（private、`gtf-test-api` / `gtf-test-frontend` / `gtf-test-firmware`）を GitHub 上に新規作成する**。Topic は GitHub 上にしか存在しないので、
   受け入れ Case 1〜6 には実リポが要る。本番の 100 件超のリポで書き込みを試すのは危険なので使い捨てを作る。
   作成者は (a) 田中さんがホストで `gh repo create` ×3、または (b) エージェントがコンテナの `.env` にある `GH_TOKEN_EDIT_SELF` で作成。
   エージェントは今のところ `GH_TOKEN_READ_ALL` を読み取り確認にだけ使った。書き込み系トークンは許可があるまで使わない。M4 までに決めればよい。
4. PAT はエージェントに渡さない方針で問題なし（§2-12）。田中さんが作るのは 2 本: 本番用（自分の Chrome）と、テストリポ限定のテスト用（9224 のプロファイル）。テスト用は M2 で必要。
6'. クライアント案件の Topic を匿名コード方式にするか（ストア公開後は一般ユーザーにも同じ問題があるので、Phase 2 のローカル別名の優先度に影響）。

## 8. 着手手順（次の一手）

1. M0: リポ作成 → ビルド/テスト基盤 → 最小 manifest → Load unpacked（人間ゲート、9224 のプロファイル）。
2. M1: 9224 で GitHub にログイン（人間ゲート）→ ログイン時 DOM の現物確認 → 結果をこの文書 §1 に追記。
3. 田中さんがテスト用 PAT を作成（§7-4）。M2 で Options に貼る。
4. テストリポ作成（§7-3、M4 まで）→ M4 で Case 1/6 → v0.1 Read-only タグ。
