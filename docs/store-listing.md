# Chrome ウェブストア 掲載準備メモ

作成 2026-09-04 / 最終更新 2026-09-05 / 対象バージョン 0.4.1 / 公開者: 合同会社HASH7FF

**入力は全て完了し、あとは田中さんが「審査のため送信」を押すだけ**（2026-09-05 時点）。
アイテム ID `gmgodfjbahmhgnpmijnifcibicpdelop` / パブリッシャー ID `7309b692-b3ca-4fc1-ba1b-9973aa83db58`。

## 事前に必要なもの

| 項目 | 状態 |
|---|---|
| 開発者アカウント登録（初回 5 USD、Google アカウント） | ✅ 2026-09-04 |
| 公開者名を HASH7FF にする（要メール確認） | ✅ 表示名 `HASH7FF`／連絡先 `support@hash7ff.com` 確認済み |
| アイコン 128×128 PNG | ✅ `icons/icon128.png`（`assets/icon.svg` から生成） |
| スクリーンショット 1280×800（5 枚） | ✅ `assets/screenshots/`。**デモ用データ**で撮影（下記） |
| プライバシーポリシー URL | ✅ https://hash7ff.github.io/github-topic-groups/privacy.html |
| ホームページ URL | ✅ https://hash7ff.github.io/github-topic-groups/ |
| サポート連絡先 | support@hash7ff.com |

## スクリーンショットの作り方

`node scripts/demo-screenshots.mjs` で 1280×800 を 5 枚生成する（`--keep` を付けるとデモ状態のまま残る）。

**実在のリポジトリは 1 つも写らない。** 拡張のセッションキャッシュに架空のリポジトリ一覧を書き込んでから撮影し、
最後にキャッシュを消すだけなので、**GitHub には一切書き込まない**（Topic も付けない、リポジトリも作らない）。
デモの内容は `scripts/demo-screenshots.mjs` の `DEMO` 配列にあり、Platform / Mobile / Open Source の 3 グループと
未分類 2 件で構成している。

| ファイル | 内容 |
|---|---|
| `01-grouped.png` | グループ表示の全体像 |
| `02-move-to.png` | Move to… ダイアログ |
| `03-new-group.png` | 新規グループ作成（Topic プレビューと公開性の警告つき） |
| `04-original.png` | Original 表示へ戻せること |
| `05-settings.png` | 設定画面（Sign in with GitHub） |

注意点が 2 つある。
- プロフィール左側に本人のアバターと所属 Organization が写る。いずれも公開情報だが、避けたい場合は
  Organization のリポジトリ一覧ページで撮ると個人情報は写らない。
- GitHub のタブに出る総数（現在 109）はデモの件数と一致しない。気になる場合は撮影時に DOM 上の数値も
  合わせる（掲載の可否に影響する類のものではない）。

## リスティング

- **名前**: Topic Groups for GitHub
- **概要（132 文字以内）**: Group your GitHub repositories into groups using topics. No new database, no renamed repositories.
- **カテゴリ**: Developer Tools
- **言語**: English（日本語の説明を追加してもよい）

### 説明文（英語）

```
GitHub has no groups for repositories. Once you have more than a handful, the list becomes a wall of names.

Topic Groups for GitHub turns your existing GitHub topics into groups. Tag a repository with a topic such as
topic-groups-platform and it appears under a collapsible "Platform" group on your Repositories tab.

- Topics are the only source of truth. Nothing is stored in a private database, so your classification stays on
  GitHub: uninstall the extension and it is still there, use another computer and it is already there.
- Repositories keep their names. No more platform-api prefixes leaking into clone directories.
- Your other topics are never touched. Moving a repository between groups rewrites only the group topic.
- Always escapable. A Grouped / Original switch brings GitHub's own list back at any time, and GitHub's own
  search, type, language and sort controls keep working.
- Sign in with GitHub. No personal access token to create; the extension asks GitHub for permission through the
  official device flow and talks to nobody but GitHub.
- Works on organization repository pages too, for organizations where you install the app.

Open source (MIT): https://github.com/hash7ff/github-topic-groups
```

### 権限の説明（審査で聞かれる項目）

- `storage`: 認証情報と、折りたたみ状態などの表示設定をブラウザ内に保存するため。
- ホスト権限 `https://github.com/*`: リポジトリ一覧ページにグループ表示を差し込むため、およびサインイン（device flow）のため。
- ホスト権限 `https://api.github.com/*`: リポジトリ一覧の取得と Topics の書き換えのため。
- リモートコードの使用: なし（すべて拡張に同梱）。

### データ利用の申告

- 収集する個人情報: **なし**（認証情報はブラウザ内にのみ保存し、送信先は GitHub のみ）。
- 販売・広告・信用調査への利用: なし。
- 申告する用途: 「拡張機能の単一目的（リポジトリのグループ表示）」のみ。

## 送信フォームに申告した内容（2026-09-05）

審査に出す前に一度読み返せるように、こちらで入力した申告をそのまま残す。

| 欄 | 申告 |
|---|---|
| 収集するユーザーデータ | **認証に関する情報のみ**。GitHub のアクセストークンを `api.github.com` と `github.com` に送るため。他の 8 分類はどれもチェックしていない |
| 3 つの表明 | 3 件ともチェック（第三者への販売・転送をしない／単一用途以外に使わない／信用力判断や融資に使わない） |
| リモートコード | 使っていない |
| 公開設定 | 限定公開（リンクを知っている人だけ） |
| 販売地域 | すべての地域 |
| 決済 | 料金なし |

「認証に関する情報」を選んだのは、Google の定義では**端末外への送信が「収集」**にあたるため。
本拡張がトークンを送る先は GitHub だけで、当社のサーバーは無い。プライバシーポリシーの記述と一致させてある。

## 画像アセットの差し替え（2026-09-05 にやり直した）

**スクリーンショットは 5 枚まで**。差し替えは追加ではなく、古い方を消してから入れる。
一度、旧セット 5 枚を消さずに新セットを足して **10 枚**になっていた（コンソールは受け付けてしまう）。

消す時の注意: タイル上の削除ボタンは `aria-label="画像を削除 <代替テキスト>"` を持つ。
**必ずこの aria-label で指定する**（`スクリーンショット N` で始まるものだけ）。祖先要素をたどって探すと
同じ箱に入っているショップ アイコンまで巻き込む（実際に一度アイコンを消してしまった）。
アップロード先の `input[type=file]` も 4 つあり、うち 3 つは表示テキストが「ここに画像をドロップ」で同一。
**セクション見出しとの上下関係（`offsetTop`）で選ぶ**のが確実。

## 公開後にやること（忘れない）

- **重複した Google 支払いプロフィールの閉鎖**。2026-09-04 の登録時、既存の組織プロフィール「HASH7FF, LIMITED LIABILITY COMPANY」（Workspace / Play で使用中）とは別に、個人種別の「合同会社HASH7FF」が作られてしまった。後者には 5 ドルの登録料の履歴だけがあり、サービスの紐付けは無い。
  手順: payments.google.com → 上部の切替で**日本語名の個人版**を選ぶ → `#settings` 最下部の「お支払いプロファイルを閉鎖」。
  注意: 閉鎖は不可逆。**先に 5 ドルの領収書を保存する**（閉鎖後に閲覧できるかは未確認）。切り替えた先が日本語名であることを操作直前に目視すること（英語名を閉じると Workspace と Play に影響する）。
  公開より後に回した理由: 登録料が通ったプロフィールを提出直前に閉じる危険を避けるため。支払いが発生する画面はもう出ないので、誤選択の危険は既に無い。

## 公開範囲

最初は **限定公開（unlisted）** で数人に配り、問題がなければ一般公開に切り替える。
