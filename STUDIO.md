# Unframe Studio · 审核工作台

Unframe has optional, shared sign-in and public visitor registration. Anyone can browse as a guest. **Sign in / 登录** is available on museum discovery and visitor Home; **Create account / 注册** opens the registration form. Successful sign-in or registration returns to the visitor interface. Only accounts authorized by the server see **Studio / 审核后台**, which switches to the review workspace. The Studio wordmark's workspace menu switches back to Visitor while retaining the same login.

| Account state / 账号状态 | Visitor / 访客界面 | Studio option / 审核后台选项 |
| --- | --- | --- |
| Guest / 未登录 | Available / 可直接使用 | Hidden / 不显示 |
| Signed-in visitor / 普通账号已登录 | Available / 可使用 | Hidden / 不显示 |
| Administrator, reviewer or publisher / 管理员、审核员、发布员 | Available / 可使用 | Available / 可切换 |

登录不是使用 Unframe 的前提。普通账号与获授权账号共用同一个登录页；是否显示审核后台由后端账号权限决定。切换访客/审核界面不会退出登录。

## Start and sign in / 启动与登录

Run the backend and Expo from two terminals in the repository root:

```sh
npm start
npm run mobile:web -- --port 8081
```

On Windows use `npm.cmd` in place of `npm`. The backend defaults to port 3000. If using a different backend port, set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to its reachable address and restart Expo. Studio uses the same API address as the visitor AI client; it does not start or require the AI models.

首次部署时，在运行后端的电脑上进入“登录 → 初始化工作区”，创建首位管理员，填写姓名、邮箱和至少10个字符的密码。没有内置账号或默认密码；初始化选项只在尚无管理员且通过本机连接时出现。创建成功后先返回访客主界面，再从新增的审核后台入口进入 Studio。

Visitors can register with an email, a 10–128 character password and matching confirmation. Registration signs them in as **Visitor**; the initial display name comes from the email prefix. The server ignores client-supplied staff permissions, checks email uniqueness without case sensitivity, hashes passwords with scrypt and limits registration attempts per IP. New visitor accounts do not consume the first-administrator setup step.

注册仅创建普通用户，成功后返回访客主界面。登录页保留图形 Logo 和字标，注册页直接以创建账号标题开头；两页均使用展廊照片与表单的左右布局，提供中英文切换及不登录使用入口。重复邮箱、密码长度和确认密码错误会显示对应语言的提示。

On the backend computer, open **Sign in → Initialize workspace** to create the first administrator using an email not already registered. This local bootstrap option closes after an administrator exists. Administrators can also create named accounts in **Studio avatar → Account access → Add account**. New accounts default to **Visitor**, and administrators explicitly assign Reviewer, Publisher or Administrator to enable Studio. Existing accounts can be granted or revoked from **Edit access → Save access**; at least one administrator must remain. There is no default password.

登录会话由整个应用共享，界面切换保留登录状态。主动退出、会话到期或服务端失效后隐藏审核入口。权限在每次审核 API 请求和数据写入时重新校验，撤权立即阻止后台访问；界面在重新进入、回到前台和登录期间的定期权限检查后同步更新。登录本身不会上传或自动同步收藏、访客资料和反馈草稿。

Accounts and password hashes persist; bearer sessions are held only in memory, expire after 12 hours, and are revoked on explicit sign-out. Switching workspaces keeps the session; reloading the entire client requires signing in again. Restarting the backend expires all sessions. `/api/auth/register` creates visitors; `/api/auth/login`, `/api/auth/session` and `/api/auth/logout` serve both visitor and staff accounts. The response's `canAccessStudio` comes from the current server-owned role. Existing Studio authentication endpoint aliases remain compatible.

Use **中文 / English** to switch the entry, login, registration and all Studio screens. Authentication pages place this control beneath the form. The language preference is stored on the device. The existing visitor content retains its original language and audio controls.

## Navigation / 页面关系

All Studio screens share **Overview / Review / Content / Workflow** — **总览 / 审核 / 内容 / 协作**.

| Area | Purpose |
| --- | --- |
| Overview / 总览 | Actual museum-scoped counts, daily review activity, priority tasks. Stat tiles open the matching filtered queue; Ready opens release review. |
| Review / 审核 | Filterable queue, before/after content, review reasons, assignment and per-case history. Evidence is a child of the same case; Review remains selected. |
| Content / 内容 | Existing Met, GOMA and fictional Northbank catalogue records. Propose an artwork or AI-text revision with a source, without changing the live content. |
| Workflow / 协作 | Initial-review, verification and ready columns; each task opens its review case. Ready content is selected and explicitly confirmed for publication. |

The avatar opens accounts and access management. Only administrators can create accounts or change their roles; reviewers and publishers cannot grant themselves permissions. Staff member lists exclude ordinary visitor accounts unless the reader is an administrator. A submitted revision changes one field: date, introduction, detailed interpretation, Chinese introduction, source URL or image credit. AI text is submitted explicitly; private conversations and camera frames are not recorded as review tasks.

## Review and publication / 审核与发布

**提交修改 → 来源核验 → 初审 → 另一位审核员复核 → 待发布 → 确认发布**

1. In Content, select **Propose update / 提交修改**, enter the proposed content, reason and an HTTPS source link.
2. Open Evidence, read the source, record the supporting finding and mark it verified. This is a human finding, not automatic validation of the external record.
3. Pass initial review. Approval remains disabled while evidence is unresolved.
4. A **different account** must complete verification. The first administrator can create a second reviewer from the avatar's member page, sign out and let that reviewer sign in.
5. An administrator or publisher selects ready cases in Workflow and confirms publication. Reviewers cannot publish.
6. Returning a case requires a reason. Revise and resubmit to restart source verification and both review stages. If the published artwork changed meanwhile, return and rebase the pending revision before publication.

Published content remains available while revisions are reviewed. Version checks reject stale decisions. Release batches commit atomically; conflicting changes to the same artwork must be rebased and published separately. History records actor, action, time and reason. Existing direct artwork PATCH requests cannot bypass review.

首次工作台显示真实的空队列；设计图中的任务数不会作为实际数据导入。访客反馈草稿、收藏和参观记录仍保存在用户设备上，不会被审核端自动收集。

## Persistence / 数据保存

Private accounts, salted scrypt password hashes, cases, findings, publication versions and history are stored in ignored `data/studio.json`, or `UNFRAME_DATA_DIR/studio.json`. Writes are serialized and replace the file atomically. Public `/api/catalogue` contains published records only; private cases and account records require authentication. Staff role checks are enforced by the server.

Publication updates the visitor catalogue and the backend's AI catalogue. The visitor app refreshes on startup, foregrounding and returning from Studio, and caches published records for offline reading. AI responses already generated and saved visitor itineraries are not retroactively rewritten. Source URLs and credits can be reviewed; this version does not replace image files or museum map graphs.

This is the repository's local, single-process JSON-storage workflow. Public hosting, multi-process database coordination, SSO, email invitations/password recovery and native device verification are separate work. Configure `AI_ALLOWED_ORIGINS` for additional trusted web origins; do not put staff passwords in `EXPO_PUBLIC_*` variables.

## Checks / 验证

```sh
npm run check
npm run mobile:check
npm test
npm run mobile:test
npm run mobile:export:web
npm run test:studio:e2e
```

Studio browser tests launch an isolated backend on 3013 and Expo on 8091 and create test-only accounts in a temporary directory. They verify guest browsing with authentication offline, optional shared login, public registration and duplicate-email handling, password validation, ordinary-account denial, authorized workspace switching without reauthentication, administrator grant/revocation for an active session, server-side expiry, late-login/registration cancellation, 320px and short-viewport forms, both languages, and publication into the real visitor UI through two different reviewers. Their own backend and data are cleaned up afterward.

To use system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` or supply `UNFRAME_BROWSER_WS_ENDPOINT` for a Playwright browser server. On the managed cloud image use the external helper `node /workspace/unframe-cloud/run-studio.mjs`; it uses the supported system-browser server connection. Browser artifacts under ignored `test-results/auth-previews` include matching English and Chinese screenshots of guest, signed-in visitor and authorized staff states.

The login/registration revision passed 65 backend/domain/AI tests, 26 mobile unit tests, nine authentication/Studio browser scenarios and all 45 original visitor browser scenarios. TypeScript, syntax checks and Web/iOS/Android resource exports passed. One existing Python-runtime test is skipped because its local Python model environment is not installed. Backend checks include registered visitors before first-admin setup, concurrent duplicate-email rejection, persisted registration, forged client roles, grant/revocation on an existing session, protection of the last administrator, and permission revalidation while a request body is still arriving. Resource export is not an installed or signed app; physical-device testing has not been performed.
