# Chrome ウェブストア 掲載準備メモ

作成 2026-09-04 / 対象バージョン 0.3.0 / 公開者: 合同会社HASH7FF

提出時に埋める内容の下書き。**未提出**（開発者登録もまだ）。

## 事前に必要なもの

| 項目 | 状態 |
|---|---|
| 開発者アカウント登録（初回 5 USD、Google アカウント） | **未** |
| 公開者名を HASH7FF にする（要メール確認） | 未 |
| アイコン 128×128 PNG | ✅ `icons/icon128.png`（`assets/icon.svg` から生成） |
| スクリーンショット 1280×800（1〜5 枚） | 🔶 暫定 `assets/screenshots/`。**実リポを分類してから撮り直す**（現状はテストリポ 3 つだけで説得力が弱い） |
| プライバシーポリシー URL | ✅ https://hash7ff.github.io/github-topic-folders/privacy.html |
| ホームページ URL | ✅ https://hash7ff.github.io/github-topic-folders/ |
| サポート連絡先 | contact@hash7ff.com |

## リスティング

- **名前**: GitHub Topic Folders
- **概要（132 文字以内）**: Group your GitHub repositories into folders using topics. No new database, no renamed repositories.
- **カテゴリ**: Developer Tools
- **言語**: English（日本語の説明を追加してもよい）

### 説明文（英語）

```
GitHub has no folders for repositories. Once you have more than a handful, the list becomes a wall of names.

GitHub Topic Folders turns your existing GitHub topics into folders. Tag a repository with a topic such as
topic-folders-client-a and it appears under a collapsible "Client A" folder on your Repositories tab.

- Topics are the only source of truth. Nothing is stored in a private database, so your classification stays on
  GitHub: uninstall the extension and it is still there, use another computer and it is already there.
- Repositories keep their names. No more client-a-api prefixes leaking into clone directories.
- Your other topics are never touched. Moving a repository between folders rewrites only the folder topic.
- Always escapable. A Grouped / Original switch brings GitHub's own list back at any time, and GitHub's own
  search, type, language and sort controls keep working.
- Sign in with GitHub. No personal access token to create; the extension asks GitHub for permission through the
  official device flow and talks to nobody but GitHub.
- Works on organization repository pages too, for organizations where you install the app.

Open source (MIT): https://github.com/hash7ff/github-topic-folders
```

### 権限の説明（審査で聞かれる項目）

- `storage`: 認証情報と、折りたたみ状態などの表示設定をブラウザ内に保存するため。
- ホスト権限 `https://github.com/*`: リポジトリ一覧ページにグループ表示を差し込むため、およびサインイン（device flow）のため。
- ホスト権限 `https://api.github.com/*`: リポジトリ一覧の取得と Topics の書き換えのため。
- リモートコードの使用: なし（すべて拡張に同梱）。

### データ利用の申告

- 収集する個人情報: **なし**（認証情報はブラウザ内にのみ保存し、送信先は GitHub のみ）。
- 販売・広告・信用調査への利用: なし。
- 申告する用途: 「拡張機能の単一目的（リポジトリのフォルダ表示）」のみ。

## 公開範囲

最初は **限定公開（unlisted）** で数人に配り、問題がなければ一般公開に切り替える。
