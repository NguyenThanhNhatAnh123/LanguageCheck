# POD Text QA

Tool nội bộ cho team POD: tải lên hàng loạt mockup, đọc chữ trên ảnh, kiểm tra chính tả/ngữ pháp bằng LanguageTool + Claude, và **chỉ hiện mockup có lỗi** kèm cách sửa. Ảnh và kết quả không bao giờ được lưu.

- Đặc tả và quy ước: [`CLAUDE.md`](CLAUDE.md)
- Kế hoạch từng giai đoạn và việc cần làm tay: [`PLAN.md`](PLAN.md)

---

## Máy dev

Cần **Node.js 24 LTS trở lên (npm 11.19 trở lên)**, Git, Java 17 trở lên.

```powershell
npm ci
copy .env.example .env.local      # rồi điền: APP_USERNAME, SESSION_SECRET, ...
npm run hash-password             # in ra dòng APP_PASSWORD_HASH_B64=... để dán vào .env.local
npm run db:migrate
scripts\start-languagetool.bat    # để cửa sổ này mở trong lúc làm việc
npm run dev                       # http://127.0.0.1:3000
```

Không có `ANTHROPIC_API_KEY` thì app chạy **chế độ mock**: kết quả Claude lấy từ `fixtures/claude/` (chọn theo tên file ảnh, xem CLAUDE.md "Chế độ mock"). LanguageTool vẫn gọi thật.

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy dev server (chỉ nghe 127.0.0.1) |
| `npm run build` / `npm start` | Build và chạy bản production (127.0.0.1:3000) |
| `npm run lint` / `npm run typecheck` / `npm test` | Kiểm tra code, unit test |
| `npm run eval -- [--dir <thư mục>]` | Chạy bộ ảnh test, in tỉ lệ bắt đúng/báo nhầm (CLAUDE.md "Stack và quy ước code") |
| `npm run db:generate` | Sinh migration sau khi sửa `lib/db/schema.ts` |
| `npm run db:migrate` | Áp migration vào `DATABASE_PATH` |
| `npm run db:backup -- <file>` | Sao lưu database (an toàn khi app đang chạy) |
| `npm run hash-password` | Tạo `APP_PASSWORD_HASH_B64` |

Nếu sửa layout hoặc store ở root layout mà dev server vẫn hiện bản cũ: tắt `npm run dev` và chạy lại.

---

## Cài lên máy server (lần đầu)

Làm xong **Giai đoạn 0B** trong `PLAN.md` trước (Node, npm, Java, Git, NSSM, cloudflared, service LanguageTool). Mọi lệnh dưới đây chạy trong **PowerShell mở bằng quyền Administrator**.

### 1. Lấy code và cấu hình

```powershell
git clone <địa chỉ repo> C:\pod-qa
cd C:\pod-qa
npm ci
copy .env.example .env.local
notepad .env.local
```

Trong `.env.local`:

- `ANTHROPIC_API_KEY`: key riêng của tool (đã đặt giới hạn chi tiêu theo tháng trên Anthropic Console).
- `CLAUDE_MODEL`: model đã chọn sau khi so Sonnet/Haiku.
- `APP_USERNAME` và `APP_PASSWORD_HASH_B64`: chạy `npm run hash-password`, nhập mật khẩu chung, dán dòng in ra.
- `SESSION_SECRET`: chuỗi ngẫu nhiên, tạo bằng `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- `SESSION_VERSION=1`, `LT_URL=http://127.0.0.1:8081`, `DATABASE_PATH=./data/app.db`.
- **Không** có `CLAUDE_MOCK`. Thiếu key, thiếu `CLAUDE_MODEL` hoặc có `CLAUDE_MOCK=1` thì app tự dừng khi khởi động (xem `app.log`).

Chỉ cho Administrators và SYSTEM đọc file này:

```powershell
icacls .env.local /inheritance:r /grant:r "Administrators:F" "SYSTEM:F"
```

```powershell
npm run build
npm run db:migrate
```

### 2. Cài app thành service (NSSM)

`where.exe node` cho đường dẫn `node.exe` (thường là `C:\Program Files\nodejs\node.exe`).

```powershell
nssm install PodQA "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000"
nssm set PodQA AppDirectory C:\pod-qa
nssm set PodQA Start SERVICE_AUTO_START
nssm set PodQA AppStdout C:\pod-qa\app.log
nssm set PodQA AppStderr C:\pod-qa\app.log
# Xoay vòng log ở 10 MB, và đợi 5 giây trước khi tự khởi động lại nếu app dừng.
nssm set PodQA AppRotateFiles 1
nssm set PodQA AppRotateOnline 1
nssm set PodQA AppRotateBytes 10485760
nssm set PodQA AppRestartDelay 5000
nssm start PodQA
```

Kiểm tra: mở `http://127.0.0.1:3000` trên máy server, phải hiện trang đăng nhập. App chỉ nghe `127.0.0.1`; từ máy khác trong mạng **không** vào được, đó là đúng.

### 3. Cloudflare Tunnel

Làm theo PLAN.md Giai đoạn 6, với một chỉnh sửa: ở bước định tuyến chọn service `HTTP` và URL **`127.0.0.1:3000`** (không dùng `localhost:3000`: app chỉ nghe IPv4, trên Windows `localhost` có thể được phân giải sang IPv6 trước). **Không** tạo route nào tới cổng 8081.

### 4. Lịch sao lưu (Task Scheduler)

Sao lưu `data/app.db` (từ điển + số liệu chi phí) mỗi đêm lúc 2:00, giữ 30 bản gần nhất. Nên để thư mục backup ở ổ khác với ổ chứa app.

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\pod-qa\scripts\backup-dictionary.ps1 -BackupDir D:\pod-qa-backup -Keep 30'
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "PodQA backup" -Action $action -Trigger $trigger -Principal $principal -Description "Sao luu tu dien POD Text QA"
```

Chạy thử ngay: `Start-ScheduledTask -TaskName "PodQA backup"`, đợi vài giây rồi xem thư mục `D:\pod-qa-backup` có file `app-<ngày>_<giờ>.db` mới. `Get-ScheduledTaskInfo -TaskName "PodQA backup"` cho biết lần chạy gần nhất (`LastTaskResult` = 0 là thành công).

Script dùng API backup của SQLite (không copy file thô), nên an toàn khi app đang chạy, và tự kiểm tra tính toàn vẹn của bản sao.

### 5. Kiểm tra cuối

Theo PLAN.md Giai đoạn 6: vào `https://qa.<domain>` bằng điện thoại dùng 4G, đăng nhập, tải thử vài mockup; khởi động lại máy server mà không đăng nhập Windows, đợi 2 phút rồi vào lại (badge LanguageTool phải xanh).

---

## Cập nhật app

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\pod-qa\scripts\deploy.ps1
```

Script làm lần lượt, dừng ở bước đầu tiên bị lỗi và báo rõ lý do:

1. Kiểm tra quyền Administrator, NSSM, service `PodQA`, phiên bản Node/npm, `.env.local` đủ biến và không có `CLAUDE_MOCK=1`. Lỗi ở bước này thì app đang chạy **không bị đụng tới**.
2. `git pull --ff-only`.
3. Dừng service, `npm ci`, `npm run build`.
4. Sao lưu database (vào `D:\pod-qa-backup`), chạy migration.
5. Chạy service, đợi trang đăng nhập trả lời (tối đa 60 giây; nếu không, in 30 dòng cuối `app.log`).

App ngừng phục vụ khoảng 1–3 phút từ bước 3 tới bước 5: nên cập nhật ngoài giờ làm việc. Nếu báo lỗi sau khi đã dừng service, script ghi rõ "service đang dừng": sửa lỗi rồi chạy lại. Tùy chọn: `-BackupDir <thư mục>`, `-SkipPull` (deploy đúng bản code đang có).

## Khôi phục từ bản sao lưu

```powershell
nssm stop PodQA
copy D:\pod-qa-backup\app-<ngày>_<giờ>.db C:\pod-qa\data\app.db
del C:\pod-qa\data\app.db-wal, C:\pod-qa\data\app.db-shm -ErrorAction SilentlyContinue
nssm start PodQA
```

## Vận hành

- **Đổi mật khẩu** (ví dụ khi có người nghỉ việc): `npm run hash-password`, sửa `APP_PASSWORD_HASH_B64` và tăng `SESSION_VERSION` trong `.env.local`, rồi `nssm restart PodQA`. Mọi máy đang đăng nhập bị đăng xuất.
- **Tool không vào được:** mở `services.msc`, xem 3 service **PodQA**, **LanguageTool**, **Cloudflared**. Log ở `C:\pod-qa\app.log` và `C:\LanguageTool\lt.log`. Vẫn không được thì khởi động lại máy.
- **LanguageTool tắt:** app vẫn chạy, kết quả chỉ từ Claude và có banner báo lỗi. Bật lại thì app tự nạp sẵn ngôn ngữ.
- **Chi phí:** trang `/usage` (số ảnh, token theo ngày và model). Chi phí thực tế xem trên Anthropic Console; giới hạn chi tiêu theo tháng ở đó là chốt chặn cuối cùng.

## Bảo mật (tóm tắt)

- App và LanguageTool chỉ nghe `127.0.0.1`; ra internet chỉ qua Cloudflare Tunnel, không mở cổng nào.
- Một tài khoản chung, mật khẩu băm bcrypt, cookie phiên ký HS256 (`httpOnly`, `secure`, `sameSite=lax`, 30 ngày), khóa 15 phút sau 5 lần sai theo IP.
- Proxy chặn mọi trang và API khi chưa đăng nhập, **và** từng route API tự kiểm tra phiên. Test `app/api/routes-auth.test.ts` bắt buộc điều này cho mọi route mới.
- Ảnh chỉ nằm trong bộ nhớ trong lúc xử lý; không ghi ra đĩa, không vào database. Log chỉ có số lượng và lỗi kỹ thuật, không có tên file, chữ trên ảnh hay secret.
- Header bảo mật cơ bản (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`), không có `X-Powered-By`.
- `npm audit --omit=dev`: 0 lỗ hổng (lần kiểm tra 2026-10-12).
