# GitHub Topic Folders

> **用語について（2026-09-04 追記）**
> この仕様書は当初の用語で書かれている。実装では用語を **Group** に統一した（経緯は
> [ImplementationPlan.md](ImplementationPlan.md) §5.8）。読み替えは次のとおり。
> **Project / Folder / フォルダ → Group（グループ）**、**接頭辞 `project-` → `topic-groups-`（設定で変更可）**、
> **拡張の名前 GitHub Topic Folders → Topic Groups for GitHub**。仕様の内容自体は変わっていない。


## GitHub Repository一覧をProject単位で整理するChrome拡張

### 1. 概要

GitHubにはGitLabのGroup/Subgroupのような、複数Repositoryを階層的に整理するための軽量なグループ機能が存在しない。

そのため、Repository数が増えると、

* どのRepositoryがどの案件に属するのか分からなくなる
* Repository名に `client-a-` などのprefixを付ける必要が出る
* prefixがRepository URLやclone後のディレクトリ名にも反映される
* Saved Viewsなどを利用してもProject追加のたびに別途メンテナンスが必要

という問題がある。

本拡張ではGitHubの **Topics** を分類情報のSource of Truthとして利用し、GitHubのRepository一覧をGitLabのGroupに近い「フォルダ形式」のUIとして表示する。

---

# 2. 基本コンセプト

GitHub Repositoryに付けられるTopicsのうち、

`project-`

から始まるTopicだけを、本拡張における「Project / Folder」と解釈する。

例：

Repository:

`api`

Topics:

* `project-client-a`
* `backend`
* `python`

拡張機能では以下のように解釈する。

Project:

`Client A`

Repository:

`api`

`backend` や `python` など、`project-` 以外のTopicには一切干渉しない。

---

# 3. 最重要原則

## 3.1 Source of TruthはGitHub Topicsのみ

ProjectとRepositoryの対応関係をChrome Extension独自のデータベースには保存しない。

GitHub Topics：

* `project-client-a`
* `project-client-b`
* `project-oss`

が唯一の分類情報となる。

そのためChrome拡張をアンインストールしても分類情報はGitHub側に残る。

また別PCから利用する場合も、同じGitHubアカウントへ接続すれば同じ分類を再現できる。

---

## 3.2 Repository名を変更しない

以下のようなRepository名にしない。

`client-a-api`

代わりに、

Repository名:

`api`

Topic:

`project-client-a`

とする。

これによりcloneした場合も、

`api/`

という自然なディレクトリ名になる。

---

## 3.3 1 RepositoryにつきProject Topicは最大1つ

通常Topicはいくつでも付けられるが、本拡張では、

`project-*`

に一致するTopicは最大1つまでとする。

正常例：

* `project-client-a`
* `python`
* `backend`

異常例：

* `project-client-a`
* `project-client-b`

複数の`project-*` Topicを検出した場合は自動変更せず、UI上で警告表示する。

---

# 4. 想定UI

GitHubの通常のRepository一覧：

Repositories

* api
* frontend
* firmware
* cool-library
* test-tool

を、本拡張によって以下のように表示する。

Repositories

▼ Client A  (3)

* api
* frontend
* firmware

▶ OSS  (1)

▼ Ungrouped  (1)

* test-tool

Projectは折りたたみ可能とする。

状態：

* ▼ Expanded
* ▶ Collapsed

---

# 5. GitHubページへの統合

別のExtension専用ページをメインUIにはしない。

GitHub本体のRepository一覧ページを開いた際に、Chrome Content ScriptによってGrouped Viewを挿入する。

例：

`https://github.com/<user>?tab=repositories`

将来的にはOrganizationのRepository一覧にも対応する。

GitHubのヘッダー、プロフィール、ナビゲーションなどは変更しない。

変更対象はRepository一覧領域のみとする。

設計としては、GitHub既存DOMを大量に組み替えるのではなく、

1. GitHub標準Repository一覧を非表示
2. 同じ領域にExtension独自のGrouped Repository Viewを挿入

という方式を優先する。

GitHub DOM構造変更の影響を最小化するためである。

ChromeのContent ScriptはページDOMの読み取り・変更が可能なので、この方式はChrome Extensionの標準機能内で実装可能。
参考：Chrome Content Scripts
https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts

---

# 6. View切り替え

安全性のため、GitHub標準表示にいつでも戻せるようにする。

Repositories画面に例えば、

`Grouped | Original`

という切替ボタンを追加する。

Grouped:

本拡張によるProject単位表示。

Original:

GitHub標準Repository一覧。

初期バージョンではGrouped Viewに問題が発生してもGitHub本来の操作を妨げないことを重要視する。

---

# 7. Projectの作成

Topicsには「空フォルダ」という概念が存在しない。

そのためMVPでは空Projectは作成しない。

「New Project」を押した場合、

Project name:

`Client C`

Repository:

* api
* frontend
* firmware

のように、最低1 Repositoryを選択するUIとする。

作成すると選択Repositoryに、

`project-client-c`

Topicを追加する。

表示名とTopic名の変換例：

Client A
→ `project-client-a`

My OSS
→ `project-my-oss`

文字列はGitHub Topicの制約に合わせて正規化する。

---

# 8. Repositoryの移動

各Repositoryに、

`Move to...`

操作を用意する。

例：

api

Move to:

* Client A
* Client B
* OSS
* Ungrouped

現在：

`project-client-a`

Client Bへ移動：

`project-client-a` を削除
`project-client-b` を追加

ただし、

* `python`
* `backend`
* `api`

など他のTopicsは必ず保持する。

---

# 9. Ungrouped

`project-*`

Topicを持たないRepositoryはすべて、

`Ungrouped`

という仮想グループに表示する。

これはGitHubにはTopicとして保存しない。

例：

Repository Topics:

* `python`
* `cli`

の場合、

Ungrouped

* repository-name

として表示する。

これにより分類漏れを簡単に発見できる。

---

# 10. Project Rename

Project名：

`Client A`

Topic：

`project-client-a`

を、

`Customer A`

へRenameする場合、

対象Project内のすべてのRepositoryについて、

`project-client-a`

を

`project-customer-a`

へ置換する。

Topics自体にRename APIが存在するわけではないため、所属Repositoryを順番に更新する一括処理として実装する。

処理前に確認Dialogを表示する。

例：

Rename "Client A" to "Customer A"?

This will update 8 repositories.

[Cancel] [Rename]

途中で失敗した場合は成功・失敗Repositoryを表示する。

---

# 11. Project削除

Project削除はRepository削除ではない。

対象Project配下のRepositoryから、

`project-*`

Topicのみを削除する。

削除後Repositoryは、

Ungrouped

に移動する。

確認Dialog：

Delete project "Client A"?

8 repositories will become Ungrouped.
Repositories themselves will NOT be deleted.

[Cancel] [Delete Project]

---

# 12. Drag & Drop

MVPでは必須としない。

Phase 2として、

RepositoryをProjectへDrag & Drop

できるようにする。

例：

Client A

api
↓ drag

Client B

内部処理：

`project-client-a`
→
`project-client-b`

Drag & Drop以外にも必ず、

`Move to...`

メニューを残す。

アクセシビリティおよび操作ミス対策のためである。

---

# 13. Topic取得

Repository一覧およびTopicsはGitHub APIから取得する。

GitHub REST APIにはRepository Topicsを取得する、

`GET /repos/{owner}/{repo}/topics`

が存在する。

またTopicsの置換には、

`PUT /repos/{owner}/{repo}/topics`

を使用できる。

Replace Topics APIは既存Topics全体を置換するAPIなので、

1. 現在Topics取得
2. `project-*`のみ変更
3. その他Topicsを保持
4. 全Topicsを書き戻す

という処理を行う。

既存Topicsを誤って消さないことを非常に重要な要件とする。

GitHub公式：

https://docs.github.com/rest/repos/repos

---

# 14. 認証

## MVP

Fine-grained Personal Access TokenをExtension設定画面から登録する方式でよい。

TokenはGitHubページDOMには絶対に挿入しない。

Chrome ExtensionのService Worker側からGitHub APIへアクセスする。

Token保存には、

`chrome.storage.local`

を利用する。

Content ScriptへTokenそのものを送信しない。

Content Script：

UI操作
↓
chrome.runtime.sendMessage
↓
Service Worker
↓
GitHub API

という構成とする。

GitHub Topic変更APIではRepository Topicsを書き換える権限が必要となる。GitHub公式ドキュメントではFine-grained tokenにRepositoryのAdministration write権限が必要とされているため、設定画面で必要権限を明示する。

将来Chrome Web Store等で一般公開する場合は、PAT手入力方式からGitHub App / OAuth方式への移行を検討する。

---

# 15. セキュリティ

以下を厳守する。

* GitHub TokenをDOMへ埋め込まない
* Content ScriptへTokenを渡さない
* console.logにTokenを出さない
* GitHub以外へTokenを送信しない
* GitHub API通信はService Workerから行う
* 必要最小限のhost permissionsを使用する
* innerHTMLへGitHub由来文字列を直接入れない
* DOM生成にはtextContent等を利用する

Chrome Content ScriptsはWebページDOMと直接接するため、秘密情報はService Worker側に隔離する。

---

# 16. TopicのPrivacyに関する注意

GitHub TopicsはPrivate Repositoryに設定した場合でもTopic名そのものは公開情報である。

そのためUI初回利用時に注意表示する。

例：

Important:
GitHub topic names are public even when used with private repositories.
Do not use confidential client or project names as project topics.

ユーザーが、

株式会社ABC極秘案件

のような名前を入力した場合でも強制禁止はしないが、警告する。

必要であれば、

`project-p001`

のような匿名Topicを使える設計を将来的に検討する。

参考：

https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics

---

# 17. Organization対応

最終的なUI階層は、

Owner
→ Project
→ Repository

とする。

例：

Personal: mutsuyuki

▼ OSS
cool-library
foo-parser

▼ Sandbox
esp32-test

Organization: company-a

▼ Client X
api
frontend

Organization: company-b

▼ Internal
firmware

ただしGitHub上ではPersonal Repository一覧とOrganization Repository一覧は別ページなので、MVPでは「現在表示しているOwner」のRepositoryをグループ化すればよい。

複数Organizationを1画面に統合するGlobal DashboardはPhase 3とする。

---

# 18. GitHub SPA遷移への対応

GitHubではページ遷移時に必ずしも完全なページreloadが発生するとは限らない。

そのためContent Script初回実行だけに依存しない。

Repositoryページへの遷移やDOM更新を検知してGrouped Viewを再初期化する。

候補：

* MutationObserver
* URL変更検知
* GitHub側Navigation Event検知

実装は冪等にする。

何度初期化処理が呼ばれても、

Grouped Viewが二重に追加されない

こと。

---

# 19. GitHub DOM変更への耐性

本Extension最大の保守リスクはGitHub側のHTML変更である。

そのため以下の設計原則を守る。

## NG

GitHubの各Repository DOMを細かく分解し、移動してGroupを作る。

## 推奨

GitHubページから取得する情報は最低限にする。

可能なら、

* 現在のOwner
* 現在Repositoriesページか
* 挿入対象コンテナ

程度のみDOMから取得する。

RepositoryデータそのものはGitHub APIから取得し、Extension独自DOMとして描画する。

---

# 20. Repository表示

Grouped View内のRepositoryは少なくとも以下を表示する。

* Repository名
* Public / Private
* Description
* Main language
* Updated time

Repository名クリック：

GitHubの通常Repositoryページを開く。

MVPではGitHub純正Repository Listと完全に同一デザインにする必要はないが、GitHubのUIに自然に馴染むデザインとする。

Dark Mode / Light Mode両対応。

GitHub側themeに追従することが望ましい。

---

# 21. Search

Grouped View上部に検索欄を用意する。

Repository名およびDescriptionを対象にクライアント側でフィルタする。

例：

Search repositories...

入力すると各Project内の該当Repositoryのみ表示する。

該当Repositoryが0件になったProjectは非表示または件数0表示とする。

---

# 22. Project Sort

MVPではアルファベット順。

例：

Client A
Client B
OSS
Sandbox
Ungrouped

Ungroupedは最後。

将来的に、

* 名前順
* Repository数順
* custom order

などを追加可能。

Custom orderを導入するとGitHub Topic以外の状態保存が必要になるため、MVPでは実装しない。

---

# 23. Collapse状態

Projectの開閉状態は分類情報ではないため、

`chrome.storage.local`

へ保存してよい。

例：

Client A → open
Client B → closed
OSS → open

これはSource of Truth原則に反しない。

GitHub側に保存する必要のある情報：

Repository ↔ Project の所属関係

Chrome側だけに保存してよい情報：

* collapse状態
* Grouped / Original表示設定
* UI preferences

---

# 24. エラー処理

GitHub API失敗時にGitHub純正Repository一覧を消したままにしない。

処理：

API Error
↓
Grouped Viewにエラー表示
↓
Original Viewへ戻せる

例：

Failed to load repository groups.

[Retry]
[Show original GitHub view]

Topic変更失敗時には画面を成功状態へ先に変更しない。

API成功後にUI更新するか、Optimistic Updateする場合は失敗時に必ずRollbackする。

MVPではAPI成功後に更新する方式を推奨。

---

# 25. Project Topic異常

Repositoryに複数`project-*` Topicが存在した場合：

例：

* `project-client-a`
* `project-client-b`
* `python`

自動的にどちらかを削除しない。

表示：

Conflict

api

Multiple project topics detected:

* Client A
* Client B

[Fix]

Fixから所属Projectを1つ選択できるようにする。

---

# 26. 想定ファイル構成

Manifest V3を使用する。

例：

github-topic-folders/

manifest.json

src/
content/
content.js
content.css

background/
service-worker.js

api/
github-api.js

ui/
repository-view.js
project-group.js
dialogs.js

options/
options.html
options.js
options.css

icons/

README.md

責務を分離する。

content.js：
GitHubページ検出・UI mount

service-worker.js：
Content Scriptとのmessage通信・GitHub APIアクセス

github-api.js：
GitHub REST API wrapper

repository-view.js：
Repository一覧描画

project-group.js：
Grouping logic

dialogs.js：
Move / Rename / Delete等

---

# 27. Manifest V3

最低限必要になりそうな要素：

* manifest_version: 3
* content_scripts
* background.service_worker
* storage permission
* GitHub host permissions
* GitHub API host permission

不必要に、

`<all_urls>`

を要求しない。

対象ドメインをGitHub関連に限定する。

---

# 28. MVP機能

Version 0.1では以下だけ完成させる。

必須：

1. GitHub Repository一覧ページを検出
2. GitHub APIからRepository情報取得
3. `project-*` Topic抽出
4. Project別Grouping
5. Ungrouped表示
6. 折りたたみ
7. Repositoryクリック
8. Grouped / Original切替
9. 新しいProjectへRepositoryを所属
10. Repositoryを別ProjectへMove
11. Project Rename
12. Project Delete
13. APIエラー処理
14. 複数project Topic conflict検出

非必須：

* Drag & Drop
* Global Dashboard
* custom ordering
* nested folders
* GitHub App認証
* Chrome Web Store公開対応

---

# 29. Phase 2

以下を追加する。

* Drag & Drop
* 複数Repository一括Move
* Repository multi-select
* Project context menu
* Repository件数
* Public / Private filter
* Language filter
* UI polish

---

# 30. Phase 3

以下を検討する。

## Global Repository Dashboard

Personal Accountと所属Organizationsをまとめて、

Personal
Client A
OSS

Organization A
Internal
Product X

Organization B
Client Y

のように1画面表示する。

Extension iconからDashboardを開く方式でもよい。

---

# 31. 将来的なNested Project

MVPでは、

Project
→ Repository

の1階層のみ。

将来的に、

Client A
Backend
Frontend

のようなSubgroupが欲しくなった場合は別設計とする。

GitHub Topicsは本来階層構造ではないため、MVP段階では無理に対応しない。

---

# 32. UX上の重要事項

本ExtensionはGitHubに新しいRepository管理方式を押し付けるのではなく、

「TopicsをGitLab Groupのように見せるView layer」

として設計する。

そのためExtensionを利用していない環境でも、

Repository：
api

Topics：
project-client-a
backend
python

という通常のGitHub Repositoryとして完全に利用可能であること。

Extension独自形式へRepositoryをロックインしない。

---

# 33. 受け入れ条件

以下を満たせばMVP完成とする。

### Case 1

Repositories：

api
frontend
firmware

Topics：

api:
`project-client-a`

frontend:
`project-client-a`

firmware:
なし

表示：

Client A

* api
* frontend

Ungrouped

* firmware

---

### Case 2

firmwareをClient AへMove。

Topics：

firmware:
`project-client-a`

となること。

表示：

Client A

* api
* frontend
* firmware

Ungroupedは消える。

---

### Case 3

api Topics：

* `project-client-a`
* `python`
* `backend`

Client BへMove。

結果：

* `project-client-b`
* `python`
* `backend`

になること。

`python` と `backend` は絶対に失われない。

---

### Case 4

Client AをCustomer AへRename。

所属Repositoryすべてについて、

`project-client-a`

が、

`project-customer-a`

へ置き換わる。

---

### Case 5

Project削除。

Repository自体は削除されず、

`project-*`

Topicだけが削除され、RepositoryはUngroupedへ移る。

---

### Case 6

GitHub API通信失敗。

GitHub標準Repository一覧へ戻せること。

GitHubページ自体の操作を破壊しないこと。

---

# 34. 開発優先順位

まずUIを作り込むのではなく、以下の順で実装する。

1. Manifest V3最小構成
2. GitHub RepositoryページへHello World UI挿入
3. GitHub認証
4. Repository一覧取得
5. Topics取得
6. `project-*` grouping
7. Grouped View描画
8. Original View切替
9. Topic変更API
10. Move
11. Rename
12. Delete
13. Error handling
14. UI polish
15. Drag & Drop

---

# 35. LLMへの実装指示

この仕様書を基準としてChrome Manifest V3 Extensionを実装すること。

最初からすべて実装せず、動作確認可能な小さい単位に分けて開発すること。

特に以下を重視する。

* GitHub既存Topicsを破壊しない
* `project-*`以外のTopicsを絶対に保持する
* PATをGitHub DOMやContent Scriptへ露出しない
* GitHub標準UIへいつでも戻せる
* GitHub DOMへの依存を最小限にする
* API / UI / grouping logicを分離する
* 各操作を失敗時に安全に復旧できるようにする

まずVersion 0.1として、

「Repository一覧を読み込み、`project-*` Topicごとに折りたたみ表示するRead Only版」

を完成させること。

Read Only版の動作確認後に、

* Move
* Create
* Rename
* Delete

の書き込み機能を段階的に追加すること。

Read Only版が完成する前にDrag & Drop等の高度なUIを実装しないこと。

