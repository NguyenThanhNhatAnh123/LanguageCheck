# Kế hoạch triển khai — POD Text QA Dashboard

Kiến trúc: 1 máy Windows 24/7 chạy cả app lẫn LanguageTool, đưa ra internet bằng Cloudflare Tunnel, đăng nhập 1 tài khoản chung, không lưu mockup.

Mỗi giai đoạn gồm 3 phần: việc bạn tự làm, prompt dán vào Claude Code, và cách kiểm tra là xong. Chỉ sang giai đoạn sau khi phần kiểm tra đã đạt.

---

## Giai đoạn 0A — Chuẩn bị (bạn tự làm)

1. **Anthropic Console**: tạo API key riêng cho tool. **Đặt giới hạn chi tiêu theo tháng.**
2. **Cloudflare**: tạo tài khoản và mua tên miền.
3. **Máy dev** (máy bạn dùng Claude Code): cài Node.js 24 LTS trở lên, Git và Java 21.
   ```
   winget install OpenJS.NodeJS.LTS
   winget install Git.Git
   winget install EclipseAdoptium.Temurin.21.JRE
   ```
   Sau đó chạy `scripts/start-languagetool.bat` và mở `http://localhost:8081/v2/languages`. Thấy danh sách ngôn ngữ là đạt.
4. **Tạo repo GitHub riêng tư** cho project. Đặt `CLAUDE.md`, `PLAN.md`, `docs/` và `scripts/` vào thư mục gốc.
5. **Bộ ảnh test** khoảng 20–30 mockup, kèm `test-images/expected.csv` (tên file, chữ đúng, có lỗi không). Nên có đủ các loại:
   - lỗi thật ở cả 4 ngôn ngữ
   - mockup đúng hoàn toàn
   - slang có chủ đích
   - chữ in hoa tiếng Đức và tiếng Pháp
   - font tattoo khó đọc
   - mockup không có chữ

   **Không commit bộ ảnh test lên GitHub** (thêm vào `.gitignore`).

---

## Giai đoạn 0B — Chuẩn bị máy server Windows (bạn tự làm)

Mọi lệnh chạy trong **PowerShell mở bằng quyền Administrator**.

### 1. Cho máy chạy ổn định 24/7
- Settings → System → Power: **Sleep = Never**.
- Windows Update → Advanced options → Active hours: đặt theo giờ làm việc, để máy chỉ tự khởi động lại vào ban đêm.
- BIOS: bật **Restore on AC power loss** (có thể tên "AC Back" / "Power On"), để có điện lại là máy tự bật.

### 2. Cài phần mềm
```powershell
winget install EclipseAdoptium.Temurin.21.JRE
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install NSSM.NSSM            # nếu lỗi, tải tại nssm.cc
winget install --id Cloudflare.cloudflared
```
Mở PowerShell mới, chạy `where.exe java` và `where.exe node`. Ghi lại 2 đường dẫn này để dùng ở các bước sau.

Chạy `node -v` và `npm -v`: cần Node **24 trở lên** và npm **11.19 trở lên**. npm cũ hơn sẽ cố biên dịch `better-sqlite3` từ mã nguồn và `npm ci` thất bại (xem "Môi trường dev" trong CLAUDE.md).

### 3. Cài LanguageTool thành Windows service
```powershell
mkdir C:\LanguageTool
Invoke-WebRequest https://languagetool.org/download/LanguageTool-stable.zip -OutFile C:\LanguageTool\lt.zip
Expand-Archive C:\LanguageTool\lt.zip C:\LanguageTool
Remove-Item C:\LanguageTool\lt.zip
dir C:\LanguageTool        # ghi lại tên thư mục, ví dụ LanguageTool-6.x

nssm install LanguageTool "<đường dẫn java.exe>" "-Xmx3g -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081"
nssm set LanguageTool AppDirectory C:\LanguageTool\LanguageTool-6.x
nssm set LanguageTool Start SERVICE_AUTO_START
nssm set LanguageTool AppStdout C:\LanguageTool\lt.log
nssm set LanguageTool AppStderr C:\LanguageTool\lt.log
nssm start LanguageTool
```
Kiểm tra: mở `http://localhost:8081/v2/languages` trên chính máy server.

Phần app và Cloudflare Tunnel sẽ cài ở Giai đoạn 6, khi code đã chạy được.

---

## Giai đoạn 1 — Khung dự án, đăng nhập, kết nối LanguageTool

**Prompt cho Claude Code:**
```
Đọc CLAUDE.md. Làm Giai đoạn 1:
- Khởi tạo Next.js (App Router, TS strict, Tailwind, shadcn/ui), better-sqlite3 + Drizzle (DATABASE_PATH), migration cho bảng dictionary và usage_daily.
- Đăng nhập 1 tài khoản chung đúng theo mục "Đăng nhập" trong CLAUDE.md: trang /login, cookie phiên ký bằng SESSION_SECRET kèm SESSION_VERSION, middleware chặn mọi route, khóa 15 phút sau 5 lần sai theo IP (CF-Connecting-IP, fallback IP request). Script `npm run hash-password` in ra giá trị APP_PASSWORD_HASH_B64.
- lib/languagetool.ts: hàm check(text, language), timeout 30s, retry 1 lần.
- Nạp sẵn LanguageTool theo mục "LanguageTool: timeout và nạp sẵn" trong CLAUDE.md: chạy nền khi app khởi động (không chặn), thử lại với backoff đến khi LanguageTool sẵn sàng, chạy lại khi /api/lt-health thấy LanguageTool chuyển sang online từ offline hoặc unknown. Trạng thái và cờ "đang nạp sẵn" lưu trên globalThis, trạng thái ban đầu "unknown".
- GET /api/lt-health và badge trạng thái LanguageTool trên header (poll mỗi 30s).
- Trang /lt-test (chỉ hiện khi NODE_ENV=development): ô nhập text + chọn ngôn ngữ → hiển thị JSON LanguageTool trả về.
- Nút Đăng xuất. Tạo .env.example.
Tra docs hiện hành của Drizzle trước khi viết code.
```

**Kiểm tra (trên máy dev):**
- Chưa đăng nhập thì mọi trang đều bị chuyển về `/login`.
- Sai mật khẩu 5 lần thì bị khóa.
- Tăng `SESSION_VERSION` và khởi động lại app thì bị đăng xuất.
- `/lt-test` trả về lỗi cho câu `This are an test.`
- Badge LanguageTool chuyển đỏ khi tắt `start-languagetool.bat`.
- Tắt LanguageTool rồi khởi động app: app vẫn lên bình thường. Bật LanguageTool lên: badge chuyển xanh, log báo đã nạp sẵn đủ 4 ngôn ngữ, và lần check tiếng Đức đầu tiên trên `/lt-test` trả về nhanh (không mất ~12s).

---

## Giai đoạn 2 — Phân tích 1 ảnh bằng Claude (trong bộ nhớ)

**Prompt:**
```
Đọc CLAUDE.md và docs/claude-analyze-prompt.md. Làm Giai đoạn 2:
- POST /api/analyze nhận 1 ảnh (multipart), xử lý hoàn toàn trong bộ nhớ, KHÔNG ghi ảnh ra đĩa.
- Gọi Claude vision với system prompt + schema trong docs/claude-analyze-prompt.md, chèn từ điển (từ SQLite) vào system prompt, bật prompt caching, validate bằng zod, retry 1 lần nếu JSON lỗi. max_tokens ~3000; stop_reason = max_tokens thì retry 1 lần với ~6000, vẫn bị cắt thì trả failed.
- Giới hạn đồng thời CLAUDE_MAX_CONCURRENCY cho toàn server, retry 429/529 với backoff.
- Cộng token vào usage_daily.
- Trang tạm /dev/analyze: chọn 1 ảnh → resize ở client (cạnh dài ≤1000px, JPEG 0.85) → gửi → hiển thị ảnh (object URL) + JSON kết quả.
Tra docs Anthropic SDK hiện hành (vision, tool use / structured outputs, prompt caching).
```

**Kiểm tra:** chạy 10 mockup trong bộ test.
- Chữ đọc ra phải khớp ảnh. Chỗ không đọc được phải đánh `[?]`, không được bịa.
- Ngôn ngữ nhận diện đúng.
- Thư mục project không xuất hiện file ảnh nào.
- Xem `cache_read_input_tokens` từ lần gọi thứ 2 trở đi. Bằng 0 thì prompt chưa đủ ngưỡng cache của model; chấp nhận được.
- So sánh `CLAUDE_MODEL` giữa Sonnet và Haiku trên các mockup font khó để chọn model.

**Trạng thái (2026-10-12):** phần code đã xong và đã kiểm tra bằng chế độ mock (xem "Chế độ mock" trong CLAUDE.md): retry khi bị cắt và khi sai schema, giới hạn đồng thời, không ghi ảnh ra đĩa, không log nội dung, production dừng khi thiếu key. Chưa có API key và bộ ảnh test nên các mục dưới **chưa chạy**.

### Còn phải chạy lại khi có API key và bộ ảnh test

Đặt `ANTHROPIC_API_KEY` vào `.env.local` (dev sẽ tự chuyển từ mock sang gọi thật), rồi chạy 10 mockup qua `/dev/analyze` (hoặc màn hình chính nếu đã có Giai đoạn 4):

1. **Chất lượng đọc chữ:** chữ khớp ảnh, chỗ không đọc được là `[?]` chứ không bịa, ngôn ngữ nhận diện đúng, chữ trên nền mockup (tag, nhãn) bị bỏ qua.
2. **So Sonnet/Haiku:** đổi `CLAUDE_MODEL` giữa `claude-sonnet-5-5` và `claude-haiku-5-5` trên các mockup font khó. Thử thêm `CLAUDE_ANALYZE_EFFORT` = `low` và `medium`. Ghi lại độ chính xác, thời gian, token/ảnh để chọn model và effort.
3. **`cache_read_input_tokens`:** từ lần gọi thứ 2 trở đi có lớn hơn 0 không (xem trong JSON trên `/dev/analyze`). Bằng 0 thì prompt chưa đủ ngưỡng cache của model; chấp nhận được.
4. **Lỗi schema thật:**
   - Lần gọi đầu tiên: API chấp nhận JSON schema (các trường `nullable`) và tham số `fallbacks` (với Sonnet), không trả 400.
   - Theo dõi log `[claude] output invalid` và `output still truncated`: bao nhiêu % ảnh phải retry vì sai schema hoặc bị cắt ở `max_tokens` 3000 (thinking cũng tính vào `max_tokens`). Tỉ lệ cao thì tăng `max_tokens` hoặc giảm effort.
5. Kiểm tra `usage_daily` có tăng đúng số ảnh và token sau khi chạy.

**Kết quả với API key thật (2026-10-13), bộ test cố định 31 ảnh** (`npm run test-images`, rồi `npm run eval -- --dir test-images/synthetic`):

| Cấu hình | Bắt lỗi | Báo nhầm (xếp Lỗi) | Chữ sau khi sửa đúng | Thời gian/ảnh | Token ra/ảnh |
|---|---|---|---|---|---|
| **Sonnet 5.5, effort low** | 15/15 | 1/16 (0) | 29/30 | 3,6 s | 273 |
| Sonnet 5.5, effort medium | 15/15 | 1/16 (0) | 29/30 | 3,7 s | 285 |
| Haiku 5.5, effort low | 15/15 | 1/15 (**1**) | 27/29 | 3,5 s | 371 |

- **Theo ngôn ngữ (Sonnet low):** de-DE, fr-FR, es-ES đều 100% (bắt đúng, không báo nhầm, chữ sửa khớp). en-US: báo nhầm `HAIDA` ở mức Nghi ngờ (tên riêng chưa có trong từ điển, đúng spec); `DONT` thiếu dấu nháy được coi là "có thể cố ý" nên không áp vào "Chữ sau khi sửa".
- **Haiku:**
  - Xếp **Lỗi** cho `¡FELIZ CUMPLEAÑOS!` (đúng chính tả).
  - Viết phương án lấn sang từ bên cạnh mà code không cắt được: `MEINE HUND` → `MEINE MEINEN HUND`.
  - Một ảnh sai schema 2 lần nên thất bại.
- **Opus 5.5** (thử 8 ảnh khó, prompt cũ): không hơn Sonnet, chậm hơn.
- **Đề xuất ban đầu: Sonnet 5.5 + effort `low`** (đang là cấu hình mặc định). Không chia model theo độ khó: Haiku sai ở cả ảnh dễ, và muốn phân loại thì phải gọi thêm một lượt cho mỗi ảnh. **Cần xem lại sau khi chạy mockup thật:** Sonnet trượt tiêu chí ở ca `ICH WOG MAL`, Opus đạt; xem mục "Cổng chất lượng trước Giai đoạn 6".
- **Các mục khác:**
  - API chấp nhận schema, `fallbacks` và `effort`. Không có lần nào sai schema hay bị cắt ở `max_tokens` với Sonnet.
  - Cache có tác dụng: khoảng 2.900 token đọc cache mỗi ảnh, cộng 1.140 token vào và khoảng 270 token ra.
  - `usage_daily` ghi đúng số ảnh và token theo từng model.
  - Đường đi qua giao diện (`/api/analyze`) chạy đúng.
- **Còn thiếu:** chạy lại với **mockup thật** (chữ in và ảnh chụp khó đọc hơn chữ vẽ từ font), đặt trong `test-images/` kèm `expected.csv`.

---

## Giai đoạn 3 — Ghép LanguageTool + merge + quy tắc ngôn ngữ

**Prompt:**
```
Làm Giai đoạn 3 theo CLAUDE.md:
- Trong /api/analyze, sau bước Claude: gom block theo blocks[].language, mỗi ngôn ngữ nối text bằng "\n" rồi gọi LanguageTool một lần, map offset về từng block. Block unknown bỏ qua LanguageTool.
- Định vị issue của Claude bằng original + occurrence.
- Lọc match chính tả có từ trong dictionary: dùng loadDictionaryMatcher() / createDictionaryMatcher() trong lib/dictionary (so theo word_key, đúng ngôn ngữ). Quy đổi severity LanguageTool theo bảng trong CLAUDE.md, rồi áp các quy tắc ngôn ngữ (quy tắc ngôn ngữ đứng trên bảng quy đổi).
- Merge 2 nguồn (Claude thắng khi intentional_possible = true hoặc info), tính status (info không tính) và "Chữ sau khi sửa". Đặt các hàm này trong module dùng chung client + server.
- Phương án sửa theo mục "Phương án sửa" trong CLAUDE.md: chuyển về kiểu chữ của original (in hoa toàn bộ / viết hoa chữ đầu / thường / 1 chữ cái / kiểu khác giữ nguyên, theo locale), bỏ trùng không phân biệt hoa thường, Claude trước LanguageTool sau, tối đa 3.
- Issue chỉ LanguageTool báo: gắn nhãn tiếng Việt theo issueType (bảng trong CLAUDE.md) kèm message gốc. Không gọi Claude để dịch.
- LanguageTool lỗi: vẫn trả kết quả Claude kèm lt_status = "offline".
- Unit test cho: map offset, định vị bằng occurrence, quy đổi severity và nhãn tiếng Việt, bộ lọc ngôn ngữ, merge (gồm ca GONNA), tính status, chữ sau khi sửa.
- Unit test cho quy tắc "in hoa toàn bộ + chỉ khác dấu" (chỉ áp cho fr-FR, xét mọi phương án sau merge): ETE → ÉTÉ (fr-FR, LanguageTool báo misspelling) hạ xuống info; phương án "ETC, ÉTÉ" (ÉTÉ đứng thứ hai) vẫn hạ xuống info; TU → TÚ (es-ES) và FUR → FÜR (de-DE) vẫn giữ error.
- Unit test riêng cho chuyển kiểu chữ + bỏ trùng phương án: YOUR → YOU'RE; Your → You're; your → you're; "A" trong block thường → "An", trong block in hoa → "AN"; McDonald giữ nguyên; ß → SS khi in hoa (de-DE); É giữ dấu khi in hoa (fr-FR); "you're" và "YOU'RE" từ 2 nguồn chỉ còn 1; "Chữ sau khi sửa" của block in hoa vẫn in hoa toàn bộ.
```

**Kiểm tra:**
- Unit test pass.
- Tắt LanguageTool rồi phân tích ảnh: vẫn có kết quả, kèm `lt_status = offline`.
- Lỗi mà cả 2 nguồn cùng báo được gộp thành 1 issue có `sources` gồm cả hai.
- Áo slang (ví dụ `GONNA`) không bị xếp vào nhóm Lỗi. Mockup chỉ có issue `info` nằm trong nhóm Không lỗi.
- Áo chữ in hoa có lỗi: mọi phương án sửa và "Chữ sau khi sửa" đều in hoa toàn bộ.

**Trạng thái (2026-10-12):** đã xong, chạy bằng mock Claude + LanguageTool thật. 120 unit test qua. Chạy cả 11 fixture qua `/api/analyze`: lỗi thật en/de/fr/es → `error` (gộp cả 2 nguồn), `GONNA` và `ETE` → `ok`, `ocr-uncertain` và `HAIDA` → `warning`, chữ sau khi sửa của khối in hoa vẫn in hoa. Tắt LanguageTool → vẫn có kết quả với `ltStatus = "offline"`. Khi có API key, chạy lại các mục trên với Claude thật (xem danh sách ở Giai đoạn 2).

---

## Giai đoạn 4 — Màn hình chính: tải lên hàng loạt, chỉ hiện mockup lỗi

**Prompt:**
```
Làm Giai đoạn 4 theo mục "Luồng xử lý" và "Thẻ mockup lỗi" trong CLAUDE.md:
- Trang chính /: vùng kéo thả nhiều ảnh, cả thư mục (webkitdirectory) hoặc .zip (giải nén ở client).
- Hàng đợi client tối đa 4 request song song, thanh tiến độ, thanh tổng kết (Đã kiểm / Lỗi / Nghi ngờ / Không lỗi / Không có chữ / Thất bại).
- Nhóm Lỗi mở sẵn, nhóm Nghi ngờ thu gọn, nhóm Thất bại có nút Thử lại. ok và no_text chỉ hiện số lượng.
- Thẻ mockup lỗi: ảnh thu nhỏ bấm để phóng to, chữ đọc được có highlight, từng lỗi (chữ sai → phương án sửa, giải thích tiếng Việt, badge nguồn; issue chỉ LanguageTool báo thì hiện nhãn tiếng Việt kèm thông báo gốc), "Chữ sau khi sửa" có nút copy.
- Banner khi lt_status = offline.
- Nút "Kết thúc phiên": xóa state, revoke object URL. Cảnh báo beforeunload khi còn kết quả.
- Xóa trang tạm /dev/analyze.
```

**Kiểm tra:**
- Tải 50 mockup một lượt, không ảnh nào bị kẹt, chỉ mockup lỗi hiện ra.
- Bấm "Kết thúc phiên" thì màn hình trống.
- Thư mục project trên máy không có file ảnh nào.

**Trạng thái (2026-10-12):** đã xong, chạy bằng mock Claude + LanguageTool thật, kiểm tra tự động trên Edge chạy ẩn:
- Tải 50 ảnh + 1 file `.zip` (5 ảnh, kèm `readme.txt` và `__MACOSX`): xong 55/55 trong khoảng 32s, không ảnh nào kẹt. Chỉ thẻ Lỗi/Nghi ngờ hiện ra, Không lỗi/Không có chữ chỉ hiện số. File rác trong zip bị bỏ qua.
- "Thử lại tất cả" chạy lại ảnh thất bại. Tải lại trang hiện cảnh báo `beforeunload`. "Kết thúc phiên" làm màn hình trống.
- Tắt LanguageTool: hiện banner "LanguageTool đang lỗi, kết quả chỉ từ Claude", badge chuyển "mất kết nối".
- Không có file ảnh nào trong thư mục project; log server không chứa tên file hay nội dung chữ.

**Bạn nên tự thử bằng tay** (công cụ tự động không giả lập được):
- Kéo thả một **thư mục** vào vùng tải lên, và dùng nút "Chọn thư mục".
- Bấm "Sao chép" ở "Chữ sau khi sửa" rồi dán thử.
- Chạy lại toàn bộ với Claude thật khi có API key.

---

## Giai đoạn 5 — Từ điển + thống kê chi phí

**Prompt:**
```
Làm Giai đoạn 5:
- Nút "Thêm vào từ điển" trên từng lỗi: lưu từ (đúng ngôn ngữ) bằng addDictionaryWord() trong lib/dictionary (đã có từ Giai đoạn 1: tự tính word_key; từ đã có thì trả created = false, báo "Từ này đã có trong từ điển"). Rồi lọc lại ngay các mockup trong phiên ở client bằng createDictionaryMatcher() (lỗi đó biến mất, status tính lại).
- Trang /dictionary: xem/thêm/xóa từ theo ngôn ngữ, ghi chú, import/export CSV. Import cũng đi qua addDictionaryWord() để không tạo bản trùng.
- /dictionary và /usage theo mục "Giao diện" trong CLAUDE.md; thêm link vào header. Chuyển qua lại giữa các trang không được mất phiên kiểm tra (SessionProvider ở root layout).
- Trang /usage: bảng usage_daily (số ảnh, token vào/ra theo ngày) + tổng tháng này.
- Script `npm run eval`: chạy toàn bộ test-images, so với test-images/expected.csv, in tỉ lệ bắt đúng và tỉ lệ báo nhầm.
```

**Kiểm tra:**
- Thêm một từ vào từ điển thì từ đó không còn bị báo lỗi nữa, cả trong phiên hiện tại lẫn lần tải lên sau.
- Chạy `npm run eval` và ghi lại kết quả để so sánh sau này.

**Trạng thái (2026-10-12):** đã xong, chạy bằng mock Claude + LanguageTool thật, kiểm tra tự động trên Edge chạy ẩn:
- "Thêm vào từ điển" trên thẻ HAIDA: toast có "Hoàn tác", thẻ chuyển từ Nghi ngờ sang Không lỗi. Hoàn tác → lỗi hiện lại, từ điển trống.
- `/dictionary`: thêm (có cảnh báo trùng `STRASSE`/`Straße`), xóa + Hoàn tác, nhập CSV (1 mới, 1 trùng, 1 dòng lỗi được báo), xuất CSV đúng nội dung. Chuyển qua `/dictionary`, `/usage` rồi về `/` vẫn giữ phiên.
- Lần tải lên sau: server lọc bằng từ điển trong SQLite (đã có từ Giai đoạn 3).
- `npm run eval -- --dir <thư mục>` chạy đúng ở chế độ mock (phân loại đúng / bỏ sót / báo nhầm / thất bại, lưu JSON).
- Chế độ mock không ghi vào `usage_daily` (bảng đang trống, không có dữ liệu mock nào cần xóa).

**Còn phải làm khi có API key và bộ ảnh test:** tạo `test-images/expected.csv` (mẫu `docs/expected.example.csv`), chạy `npm run eval` với Claude thật, ghi lại tỉ lệ bắt đúng / báo nhầm làm mốc. Chạy lại sau mỗi lần đổi prompt, model hoặc effort (và sau Giai đoạn 7).

---

## Cổng chất lượng trước Giai đoạn 6 (tiêu chí đạt)

`npm run eval` tự kiểm và in ĐẠT/TRƯỢT theo từng ngôn ngữ, kèm danh sách ca trượt (`evaluateCriteria()` trong `lib/eval/metrics.ts`).

**Tiêu chí:**
1. 0 ảnh đúng bị xếp Lỗi. Nghi ngờ trên ảnh đúng ≤ 2 mỗi ngôn ngữ.
2. de/fr/es: 100% lỗi cố ý nằm ở Lỗi hoặc Nghi ngờ. Các ca đánh dấu `must_error` trong `expected.csv` (ANO, FUR, sai giống/số/cách) phải ở **Lỗi**.
3. "Chữ sau khi sửa" đúng ở mọi ca (không có chữ hỏng như `FU IMMER`, `THE BEST THE BEST`).
4. Trung bình < 15 s/ảnh.

**Hai bộ test:**
- **Bộ tổng hợp 31 ảnh** (`npm run test-images`): chỉ kiểm logic (quy tắc, gộp nguồn, "Chữ sau khi sửa").
- **Bộ mockup thật** (`test-images/`): **phải ĐẠT trước Giai đoạn 6.**

### Kết quả 2026-10-13

| Bộ | Model (effort low) | de-DE | fr-FR | es-ES | en-US | s/ảnh | Kết luận |
|---|---|---|---|---|---|---|---|
| Tổng hợp (31) | Sonnet 5.5 | ĐẠT | ĐẠT | ĐẠT | TRƯỢT (3) | 3,8 | TRƯỢT |
| Tổng hợp (31) | Opus 5.5 | ĐẠT | ĐẠT | ĐẠT | ĐẠT | 5,2 | **ĐẠT** |
| Thật (8, toàn de-DE) | Sonnet 5.5 | TRƯỢT (1) | — | — | — | 5,1 | TRƯỢT |
| Thật (8, toàn de-DE) | Opus 5.5 | ĐẠT | — | — | — | 6,6 | **ĐẠT** |

**Ca trượt và lý do:**
- **Sonnet, mockup thật, `08-sk7535-black.jpg` (`ICH WOG MAL 3500 GRAMM`), trượt tiêu chí 1.**
  - Claude xếp **Lỗi** cho `WOG` (loại spelling), dù `wog` là Präteritum đúng của `wiegen`. Lời giải thích của Claude còn tự viết "'Ich wog mal' là đúng ngữ pháp".
  - Lặp lại 3/3 lần với effort `low`, và 3/3 lần với `medium` (2 Nghi ngờ, 1 Lỗi).
  - LanguageTool không báo gì. Nhưng theo cách tính status, "Claude báo error, không cố ý" là đủ để xếp Lỗi.
  - Opus đúng ở 3/3 lần chạy.
- **Sonnet, bộ tổng hợp, `en-dont-loose-hope.png`, trượt tiêu chí 3.**
  - Claude coi `DONT` thiếu dấu nháy là "có thể cố ý" nên không áp vào chữ sửa: ra `DONT LOSE HOPE`, đáp án `DON'T LOSE HOPE`.
  - Không phải chữ hỏng, nhưng chưa sửa hết. Lặp lại ở cả 3 lượt chạy với prompt mới. Opus sửa đúng.
- **Ảnh đúng bị xếp Nghi ngờ (vẫn trong giới hạn ≤ 2):**
  - `en-haida-pride.png`: tên riêng chưa có trong từ điển, cả 2 model. Đúng spec.
  - `14-sk5231-black.jpg` (Opus): thiếu dấu phẩy trước mệnh đề quan hệ (`PROBLEME, VON DENEN`, `WEISE, DIE`), mức "có thể cố ý". Đúng ngữ pháp Đức, và thiết kế có dùng dấu phẩy ở chỗ khác nên báo là hợp lý.

**LanguageTool và Claude cùng kiểm mọi ảnh:**
- Bộ tổng hợp: 12 lỗi cả 2 nguồn cùng báo, 9–10 lỗi chỉ Claude báo, 0 lỗi chỉ LanguageTool báo (sau khi lọc).
  - Lỗi chỉ Claude bắt đều là lỗi ngữ pháp/hợp giống: `MEINE HUND`, `PARFAIT`, `ORGULLOSO`, `CHOSE`, `LOOSE`, `THERE`. LanguageTool (chưa có n-gram) không bắt được loại này.
- 8 mockup thật: LanguageTool trả về 0 match, đúng vì chữ không sai. LanguageTool chấp nhận `WOG`.
- Từ nay eval in trạng thái LanguageTool của từng ảnh, và cảnh báo nếu có ảnh LanguageTool lỗi/tắt (kết quả khi đó chỉ từ Claude).

**Chưa đủ để mở cổng:**
- Bộ thật mới có 8 ảnh, toàn tiếng Đức, không ảnh nào có lỗi. Tiêu chí 2 (bắt lỗi) chưa kiểm được trên ảnh thật.
- Cần thêm mockup thật **fr-FR và es-ES**, và mockup thật **có lỗi**.
- Đáp án `test-images/expected.csv` hiện là bản nháp Claude Code soạn từ việc đọc ảnh, cần người xác nhận.

**Đã chọn (b), giữ Sonnet 5.5 + effort `low`:**
- Lỗi **chính tả** chỉ Claude báo, trên từ mà LanguageTool (đang chạy) chấp nhận, thì tối đa Nghi ngờ, và không áp vào "Chữ sau khi sửa".
- Ngoại lệ: phương án chỉ khác ở dấu hoặc ký tự đặc biệt (`ANO` → `AÑO`, `TU` → `TÚ`). Các quy tắc ngôn ngữ vẫn ưu tiên.
- Lỗi ngữ pháp/hợp giống không bị ảnh hưởng. Chi tiết ở CLAUDE.md "Cách tính `status`".
- **Nếu mockup thật de/fr/es bị đọc sai hoặc báo nhầm nhiều, thử lại Opus 5.5** bằng `CLAUDE_MODEL=claude-opus-5-5` (không cần sửa code). Opus đạt cả 2 bộ ở lần đo 2026-10-13, chậm hơn khoảng 30–40%.

**Kết quả sau quy tắc (b), Sonnet 5.5 effort `low` (2026-10-13):**

| Bộ | de-DE | fr-FR | es-ES | en-US | s/ảnh | Kết luận |
|---|---|---|---|---|---|---|
| Thật (8, toàn de-DE) | ĐẠT | — | — | — | 5,3 | **ĐẠT** (tạm thời: đáp án `claude-draft`) |
| Tổng hợp (31) | ĐẠT | ĐẠT | ĐẠT | TRƯỢT (3) | 3,8 | TRƯỢT (chỉ en-US) |

- `ICH WOG MAL` giờ là Nghi ngờ (`ltAccepted`). Lần này Claude gợi ý `WOG` → `WIEGE` (sai). Phương án đó không được áp, nên "Chữ sau khi sửa" vẫn đúng.
- de/fr/es trên bộ tổng hợp không đổi: 9/9 lỗi ở Lỗi, kể cả mọi ca `must_error` (`ANO`, `FUR`, `PARFAIT`, `ORGULLOSO`, `CHOSE`, `MEINE HUND`). 0 ảnh đúng bị báo.
- en-US vẫn trượt tiêu chí 3 ở `DONT LOOSE HOPE`. Claude coi `DONT` là "có thể cố ý" nên ra `DONT LOSE HOPE`. Quy tắc (b) không nhằm sửa ca này. Còn chờ quyết định: thiếu dấu nháy trong tiếng Anh (`DONT`, `CANT`) có luôn là Lỗi không.
- LanguageTool chạy ở mọi ảnh có chữ (30/30 bộ tổng hợp, 8/8 bộ thật).

**Bỏ tiếng Anh khỏi tool (2026-10-13):**
- Tool chỉ kiểm de-DE, fr-FR, es-ES. Claude vẫn nhận diện tiếng Anh nhưng không báo lỗi; LanguageTool bỏ qua block tiếng Anh.
- Ảnh có chữ tiếng Anh vào nhóm Nghi ngờ, kèm "Chữ tiếng Anh: tool không kiểm, cần xem tay" (CLAUDE.md "Quy tắc ngôn ngữ").
- Bộ tổng hợp còn 29 ảnh: 12 ảnh tiếng Anh được chuyển sang de/fr/es, giữ các kiểu khó (nghiêng, mòn, mờ, chữ viết tay, trong suốt, tag cổ áo); giữ 1 ảnh tiếng Anh phải vào Nghi ngờ.
- Ca `DONT` không còn liên quan.

| Bộ | de-DE | fr-FR | es-ES | Tiếng Anh (không kiểm) | s/ảnh | Kết luận |
|---|---|---|---|---|---|---|
| Tổng hợp (29) | ĐẠT | ĐẠT | ĐẠT | ĐẠT (ở Nghi ngờ) | 3,8 | **ĐẠT** |
| Thật (8, toàn de-DE) | ĐẠT | — | — | — | 5,0 | **ĐẠT** (tạm thời: đáp án `claude-draft`) |

- Ảnh đúng bị xếp Nghi ngờ (trong giới hạn ≤ 2): `de-haida-stolz.png` (tên riêng chưa có trong từ điển), `08-sk7535-black.jpg` (`WOG`, LanguageTool coi là đúng).
- de/fr/es: bắt đúng 12/12 lỗi, đều ở Lỗi, kể cả 3 ca mới chuyển sang (`GUTE MENSCH` chữ mòn, `EL MEJOR MAMÁ` chữ nghiêng, `CUMPLEANOS` font máy chữ). "Chữ sau khi sửa" đúng 28/28.
- Tag cổ áo tiếng Anh (`SIZE M / 100% COTTON`) được bỏ qua đúng, không làm ảnh thành Nghi ngờ.
- **Tắt ghi chú lỗi tiếng Anh** (`3e7915c`). Đã kiểm với Claude thật: ảnh chỉ có tiếng Anh không còn ghi chú; ảnh trộn (`NUR FUR DICH` + `YOUR THE BEST DAD`) vẫn bắt `FUR` và không nhắc tiếng Anh.
- Chạy lại 2 bộ sau khi đổi prompt: vẫn ĐẠT.
  - Bộ thật lần này có **2** ảnh đúng ở Nghi ngờ, vừa chạm giới hạn: `WOG`, và `WUSSTEST` (`14-sk5231-black.jpg`).
  - Ở cả 2 ca, Claude báo một dạng động từ đúng là lỗi chính tả, rồi tự viết trong giải thích là "đúng, không có lỗi". Quy tắc LanguageTool chấp nhận giữ chúng ở mức Nghi ngờ.
  - Khi thêm mockup thật, kiểu báo nhầm này có thể vượt giới hạn ≤ 2.

**Thêm câu "chỉ báo khi chữ thật sự sai" vào prompt + 5 mockup ảnh chụp mới (`1.png`–`5.png`), 2026-10-13:**
- 5 ảnh mới: mockup ảnh chụp có người mặc, có chữ ở hậu cảnh (poster "Good Things Take Time", "Good Vibes Only", biển "KLEINE DINGE GROSSE FREUDE"). Đáp án `claude-draft`:
  - `1.png` fr, đúng.
  - `2.png` fr, lỗi `ÉPUISER` → `ÉPUISÉE`, `must_error`.
  - `3.png` de, đúng.
  - `4.png` de, lỗi `KAFFEE MACHEN` → `MACHT`, `must_error`.
  - `5.png` de, đúng.

| Bộ | de-DE | fr-FR | es-ES | Tiếng Anh | s/ảnh | Kết luận |
|---|---|---|---|---|---|---|
| Tổng hợp (29) | ĐẠT | ĐẠT | ĐẠT | ĐẠT | 4,2 | **ĐẠT** (0 ảnh đúng bị báo) |
| Thật (13: 11 de, 2 fr) | TRƯỢT (2) | ĐẠT | — | — | 5,0 | TRƯỢT |

- Chữ hậu cảnh đều được bỏ qua đúng. "Chữ sau khi sửa" đúng 13/13 ở bộ thật.
- `JE SUIS PAS` (thiếu `ne`) chỉ là Ghi chú "có thể cố ý". `ÉPUISER` → `ÉPUISÉE` ở Lỗi (cả 2 nguồn cùng báo).
- `WUSSTEST` không còn bị báo (câu mới trong prompt có tác dụng ở ca này).
- **Ca trượt:**
  - `08-sk7535-black.jpg` (`ICH WOG MAL`): ảnh đúng bị xếp **Lỗi**.
    - Claude đổi loại lỗi từ `spelling` sang `grammar` (2/2 lần chạy lại), nên quy tắc LanguageTool chấp nhận (chỉ áp cho chính tả) không chặn được.
    - Vẫn không có phương án sửa, và giải thích vẫn tự mâu thuẫn ("wog … đúng ngữ pháp").
  - `4.png` (`KAFFEE MACHEN`): trong lượt eval Claude chấm `warning` nên chỉ ở Nghi ngờ, trượt "ca bắt buộc ở Lỗi". Chạy lại 2 lần đều là Lỗi, nên đây là dao động ngẫu nhiên.
- Quét mọi log eval từ đầu (Sonnet, Haiku, Opus, cả 2 bộ): **ca duy nhất** Claude báo `error` mà không có phương án sửa là `WOG` (báo nhầm). Không có lỗi thật nào thuộc dạng này.
- **Đề xuất, chờ duyệt:**
  - **(c)** Lỗi chỉ Claude báo mà không có phương án sửa nào thì tối đa Nghi ngờ (Claude không đưa được cách sửa nghĩa là không chắc). Sửa được `WOG` ở dạng hiện tại; không ảnh hưởng lỗi thật nào trong dữ liệu đến nay.
  - Nếu Claude vẫn báo nhầm kiểu này kèm phương án sai (đã gặp `WOGEN`, `WIEGE`), thử Opus 5.5 (đúng 3/3 ở `WOG`).
  - Ca `KAFFEE MACHEN` chưa có cách chặn trong code; cần thêm dữ liệu để biết Claude có hay chấm thấp lỗi hợp số không.

**Áp (c) + LanguageTool kiểm bản chữ thường do Claude trả về (2026-10-13):**
- **(c) đã áp** (`cb47283`): lỗi chỉ Claude báo, không có phương án → tối đa Nghi ngờ.
- **Phát hiện về LanguageTool:** với chữ IN HOA, LanguageTool gần như không bắt lỗi hợp giống/số (0/7 câu thử). Với chữ viết thường bình thường thì bắt được 6/7.
  - Tiếng Đức cần danh từ viết hoa đúng; chữ thường toàn bộ thì LanguageTool chỉ báo "danh từ viết thường".
  - Vì vậy Claude trả thêm `normal_case` cho block IN HOA (`d799e90`). Kèm bộ lọc "thiếu dấu phẩy" cho LanguageTool, và so sánh không phân biệt hoa/thường (`0680644`).
- **Kết quả (Sonnet 5.5 low):**

| Bộ | de-DE | fr-FR | es-ES | Tiếng Anh | s/ảnh | Kết luận |
|---|---|---|---|---|---|---|
| Tổng hợp (29) | ĐẠT | ĐẠT | ĐẠT | ĐẠT | 4,0 | **ĐẠT** |
| Thật (13: 11 de, 2 fr) | ĐẠT | TRƯỢT (1) | — | — | 4,9 | TRƯỢT |

- **LanguageTool giờ cùng báo 12/13 lỗi ở bộ tổng hợp** (trước: 7/13).
  - Bắt thêm: `MEINE HUND`, `PETITES CHOSE`, `PARFAIT`, `ORGULLOSO`, `EL MEJOR MAMÁ`. Các lỗi này giờ là Lỗi nhờ cả 2 nguồn, không chỉ dựa vào Claude.
  - Còn chỉ Claude bắt: `EIN GUTE MENSCH`, vì Claude viết hoa chữ đầu dòng thành `Gute` trong bản chữ thường; và `KAFFEE MACHEN`, vì LanguageTool không bắt kể cả khi viết thường.
- **Bộ thật:**
  - 3 ảnh từng bị báo "thiếu dấu phẩy" (`1.png`, `14`, `15`) giờ Không lỗi.
  - `WOG` là Nghi ngờ.
  - `KAFFEE MACHEN` ở Lỗi.
- **Ca trượt: `2.png` (fr), tiêu chí "Chữ sau khi sửa".** `ÉPUISER` → `ÉPUISÉE` ở Lỗi (cả 2 nguồn), nhưng Claude đánh dấu "có thể cố ý" nên phương án không được áp. Cùng kiểu với `KAFFEE MACHEN` ở các lượt trước (warning + "có thể cố ý").
- **Đề xuất, chờ duyệt (chỉ sửa prompt):**
  - (d) Lỗi hợp giống/số/cách và chia động từ không bao giờ là cố ý: `error`, `intentional_possible = false`.
  - (e) Trong `normal_case`, chữ đầu dòng không viết hoa trừ khi là đầu câu mới.

**Đã áp (d) và (e) (`d816447`), chạy lại 2026-10-13:**

| Bộ | de-DE | fr-FR | es-ES | Tiếng Anh | s/ảnh | Kết luận |
|---|---|---|---|---|---|---|
| Tổng hợp (29) | ĐẠT | ĐẠT | ĐẠT | ĐẠT | 3,9 | **ĐẠT** |
| Thật (13: 11 de, 2 fr) | ĐẠT | ĐẠT | — | — | 4,8 | **ĐẠT** (tạm thời: đáp án `claude-draft`) |

- (d):
  - `ÉPUISER` → `ÉPUISÉE` ở Lỗi, không còn "có thể cố ý", phương án được áp.
  - `KAFFEE MACHEN` → `MACHT` ở Lỗi.
  - "Chữ sau khi sửa" đúng 13/13 (bộ thật) và 28/28 (bộ tổng hợp).
- (e): bản chữ thường giờ là `Ich bin ein\ngute Mensch`, LanguageTool bắt được `GUTE MENSCH`. Ở bộ tổng hợp, LanguageTool cùng báo 11 lỗi, còn 2 issue chỉ Claude báo.
- **Ảnh đúng ở Nghi ngờ:**
  - Bộ tổng hợp: `de-haida-stolz.png` (tên riêng, đúng spec).
  - Bộ thật, tiếng Đức có **2, đúng bằng giới hạn**:
    - `WOG`: lỗi không có cách sửa nên hạ xuống Nghi ngờ theo (c).
    - `5.png` `ERWACHSEN VERHALTEN`: ca mới. Claude báo warning, không phương án, giải thích tự viết "Không có lỗi ở đây". Trước (d) ca này chỉ là Ghi chú.
- **Kiểu báo nhầm lặp lại của Sonnet:** tạo issue cho chữ đúng, không kèm phương án sửa, giải thích tự nói là đúng (`WOG`, `WUSSTEST`, `ERWACHSEN`). Trong mọi log đến nay, không có lỗi thật nào thuộc dạng "chỉ Claude báo, không phương án, không đánh dấu cố ý".
- **Đề xuất, chờ duyệt:**
  - **(f)** Issue chỉ Claude báo, không có phương án, không đánh dấu "có thể cố ý", không phải `ocr_uncertain` → chỉ là Ghi chú (không tính vào status). Thay cho (c).
  - Tên riêng như `HAIDA` (Claude đánh dấu "có thể cố ý") vẫn ở Nghi ngờ để nhắc thêm vào từ điển.

**Đã áp (f) thay cho (c) (`5c02c73`), chạy lại 2026-10-13:**

| Bộ | de-DE | fr-FR | es-ES | Tiếng Anh | s/ảnh | Kết luận |
|---|---|---|---|---|---|---|
| Tổng hợp (29) | ĐẠT | ĐẠT | ĐẠT | ĐẠT | 3,7 | **ĐẠT** |
| Thật (13: 11 de, 2 fr) | ĐẠT | ĐẠT | — | — | 4,8 | **ĐẠT** (tạm thời: đáp án `claude-draft`) |

- `ICH WOG MAL` giờ là Ghi chú, ảnh ở Không lỗi.
- Ảnh đúng ở Nghi ngờ: còn **1** ở mỗi bộ (dưới giới hạn 2).
  - `5.png` (`ERWACHSEN VERHALTEN`): lần này Claude đánh dấu "có thể cố ý" nên (f) không áp. Ca này Claude chấm dao động giữa các lần.
  - `de-haida-stolz.png`: tên riêng, đúng spec.
- Lỗi thật:
  - Bộ tổng hợp: 13/13 vào Lỗi/Nghi ngờ; 12/12 lỗi de/fr/es ở Lỗi; mọi ca `must_error` ở Lỗi.
  - Bộ thật: `ÉPUISER` (cả 2 nguồn) và `KAFFEE MACHEN` (chỉ Claude) đều ở Lỗi, phương án được áp.
  - "Chữ sau khi sửa" đúng 13/13 và 28/28.
- LanguageTool cùng báo 11 issue ở bộ tổng hợp; LanguageTool chạy ở mọi ảnh có chữ.
- **Thêm 8 mockup ảnh chụp tiếng Tây Ban Nha** (`2 (2).jpg` … `9 (2).jpg`, đáp án `claude-draft`; theo Claude Code đọc thì cả 8 đều đúng, văn nói/tục có chủ đích). Chạy bộ thật 21 ảnh, 2026-10-13:

| Bộ | de-DE (11) | fr-FR (2) | es-ES (8) | s/ảnh | Kết luận |
|---|---|---|---|---|---|
| Thật (21) | ĐẠT | ĐẠT | TRƯỢT | 5,3 | TRƯỢT (tạm thời: đáp án `claude-draft`) |

  - es-ES, 6/8 ảnh Không lỗi, gồm bẫy `Y LUEGO YA SI ESO`: `SI` không dấu là đúng và không bị báo.
  - **`2 (2).jpg`, `3 (2).jpg` (cùng thiết kế `CULAZO`): ảnh đúng ở Nghi ngờ** (2/2, vừa đúng giới hạn).
    - Chỉ LanguageTool báo `CULAZO` sai chính tả (từ lóng, không có trong từ điển LanguageTool), gợi ý `CALAZO`. Claude không báo.
    - Theo spec, phương án của issue `warning` được áp, nên **"Chữ sau khi sửa" thành `CALAZO`**: chữ hỏng, trượt tiêu chí 3.
  - **`5 (2).jpg`: Claude chép thiếu dấu hai chấm** trong `AVISO:` (dấu cách điệu, lẫn vào các vạch trang trí), nên "Chữ sau khi sửa" khác đáp án ở dấu đó. Đây là lỗi đọc chữ, không phải lỗi sửa.
  - Quét mọi log eval: issue **chỉ LanguageTool báo** xuất hiện 4 lần, **đều là báo nhầm** (`CULAZO` ×2, 2 lần "thiếu dấu phẩy" trước khi sửa bộ lọc). LanguageTool chưa bắt được lỗi thật nào mà Claude bỏ sót.
- **Đề xuất, chờ duyệt:**
  - **(g)** Lỗi chính tả **chỉ LanguageTool báo**, trên block Claude đã đọc mà không báo gì: vẫn ở Nghi ngờ để người xem, nhưng **không áp phương án vào "Chữ sau khi sửa"**. Thẻ ghi "Chỉ LanguageTool báo, chưa áp vào chữ sửa". Đối xứng với quy tắc LanguageTool chấp nhận. Từ lóng như `CULAZO` thì thêm vào từ điển một lần là hết báo.
  - Về `AVISO:`, chọn một trong hai:
    - Giữ tiêu chí 3 chặt (thiếu dấu khi đọc chữ cũng tính trượt).
    - Tiêu chí 3 chỉ xét chữ và số, bỏ qua khác biệt dấu câu mà tool không sửa.
- **Đã áp (g) (`e23b048`) và tiêu chí 3 bỏ qua dấu câu tool không sửa (`e4f79d5`), chạy lại 2026-10-13:**

| Bộ | de-DE | fr-FR | es-ES | Tiếng Anh | s/ảnh | Kết luận |
|---|---|---|---|---|---|---|
| Tổng hợp (29) | ĐẠT | ĐẠT | ĐẠT | ĐẠT | 3,7 | **ĐẠT** |
| Thật (21: 11 de, 2 fr, 8 es) | ĐẠT | ĐẠT | TRƯỢT | — | 4,8 | TRƯỢT (tạm thời: đáp án `claude-draft`) |

  - "Chữ sau khi sửa" đúng 21/21 ở bộ thật: `CULAZO` không còn bị đổi thành `CALAZO`, ca `AVISO:` không còn tính trượt.
  - **es-ES trượt tiêu chí 1** vì **3** ảnh đúng ở Nghi ngờ: `CULAZO` (2 ảnh cùng thiết kế) và `ANTIGILIPOLLAS` (`5 (2).jpg`). Cả 3 là từ lóng/tục chỉ LanguageTool báo.
  - Cơ chế đã có: khi Claude ghi Ghi chú "cố ý" cho từ lóng, báo động của LanguageTool được gộp thành Ghi chú (`ANTIGILIPOLLAS` ở `6 (2).jpg`, và ở `5 (2).jpg` lượt trước). Claude làm việc này không đều; với `CULAZO` thì chưa lần nào.
- **Đề xuất, chờ duyệt:**
  - **(h)** Nhấn mạnh trong prompt: từ lóng, từ tục, dạng nhấn mạnh/thu nhỏ (`-AZO`, `-ÓN`, `-ITO`), từ ghép (`ANTI-`…), thương hiệu, tên riêng mà từ điển có thể không có → luôn ghi `info` + `intentional_possible`, để báo động của LanguageTool được coi là báo nhầm. Ví dụ trong prompt khác với từ trong bộ test.
  - Song song là quy trình từ điển của team: gặp lần đầu thì thêm từ (`CULAZO`, `ANTIGILIPOLLAS`), từ đó không bị báo nữa.

**Đã áp (h) (`ed8c7c7`), chạy lại 2026-10-13:**

| Bộ | de-DE | fr-FR | es-ES | Tiếng Anh | s/ảnh | Kết luận |
|---|---|---|---|---|---|---|
| Tổng hợp (29) | ĐẠT | ĐẠT | ĐẠT | ĐẠT | 4,1 | **ĐẠT** |
| Thật (21: 11 de, 2 fr, 8 es) | ĐẠT | ĐẠT | ĐẠT | — | 5,1 | **ĐẠT** (tạm thời: đáp án `claude-draft`) |

- **Bộ thật:**
  - 0/19 ảnh đúng bị báo; bắt 2/2 lỗi thật ở Lỗi; "Chữ sau khi sửa" đúng 21/21.
  - Claude giờ ghi Ghi chú "cố ý" cho từ lóng/tục (`CULAZO`, `ANTIGILIPOLLAS`, `GILIPOLLAS`, `ME LA SUDA`, `MIERDA`, `MAJA`…). Báo động của LanguageTool trên `CULAZO`, `ANTIGILIPOLLAS` được gộp thành Ghi chú.
- **Bộ tổng hợp:** chỉ `de-haida-stolz.png` ở Nghi ngờ (tên riêng, đúng spec).
- Token ra mỗi ảnh ở bộ thật tăng nhẹ (khoảng 440 → 500) vì có thêm Ghi chú.
- **Còn thiếu trước khi mở cổng Giai đoạn 6:**
  - Thay đáp án `claude-draft` bằng chữ gốc từ file thiết kế.
  - Thêm mockup thật có lỗi: bộ thật mới có 2 lỗi (1 de, 1 fr), chưa có lỗi es nào.
- **Còn thiếu trước khi mở cổng Giai đoạn 6:**
  - ~~Mockup thật tiếng Tây Ban Nha (chưa có)~~: đã có 8 ảnh, đều không lỗi.
  - Thêm mockup thật có lỗi (mới có 2).
  - Thay đáp án `claude-draft` bằng chữ gốc từ file thiết kế.

**Đáp án bộ thật:** cả 8 dòng đang là `source = claude-draft` (Claude Code soạn từ việc đọc ảnh). Sẽ được thay bằng chữ gốc từ file thiết kế. Eval cảnh báo khi còn dòng `claude-draft`.

---

## Giai đoạn 6 — Đưa lên máy server + Cloudflare Tunnel

**Prompt:**
```
Làm Giai đoạn 6:
- Script scripts/deploy.ps1 cho máy server: git pull → npm ci → npm run build → chạy migration → nssm restart PodQA. Dừng lại và báo lỗi rõ ràng nếu bước nào thất bại.
- Script scripts/backup-dictionary.ps1: copy data/app.db sang thư mục backup kèm ngày, giữ 30 bản gần nhất.
- Thêm vào README.md: hướng dẫn cài app thành service bằng NSSM và lịch chạy backup bằng Task Scheduler.
- Rà soát bảo mật: mọi route kiểm tra phiên; không log nội dung ảnh, chữ hay secret; app chỉ lắng nghe 127.0.0.1.
```

**Bạn tự làm trên máy server** (lệnh đầy đủ ở `README.md`, mục "Cài lên máy server"; mọi lệnh chạy trong PowerShell quyền Administrator):

1. Clone repo về `C:\pod-qa`, chạy `npm ci`, tạo `.env.local` theo `.env.example` (mật khẩu chung **tối thiểu 16 ký tự ngẫu nhiên**, tạo hash bằng `npm run hash-password`), khóa quyền đọc file bằng `icacls`. Kiểm tra bằng `scripts\deploy.ps1 -NoService -CheckOnly`. Rồi chạy `npm run build` và `npm run db:migrate`.
2. Cài app thành service:
   ```powershell
   nssm install PodQA "<đường dẫn node.exe>" "node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000"
   nssm set PodQA AppDirectory C:\pod-qa
   nssm set PodQA Start SERVICE_AUTO_START
   nssm set PodQA AppStdout C:\pod-qa\app.log
   nssm set PodQA AppStderr C:\pod-qa\app.log
   nssm set PodQA AppRotateFiles 1
   nssm set PodQA AppRotateOnline 1
   nssm set PodQA AppRotateBytes 10485760
   nssm set PodQA AppRestartDelay 5000
   nssm start PodQA
   ```
   Kiểm tra bằng cách mở `http://127.0.0.1:3000` trên máy server. Cấu hình sai (thiếu key, hash mật khẩu sai, `SESSION_SECRET` ngắn, có `CLAUDE_MOCK=1`) thì app dừng ngay và ghi lý do vào `app.log`.
3. Tạo Cloudflare Tunnel:
   - Vào Cloudflare **Zero Trust → Networks → Tunnels → Create a tunnel** → chọn **Cloudflared** → đặt tên `pod-qa` → chọn **Windows**.
   - Chạy lệnh `cloudflared.exe service install <TOKEN>` mà Cloudflare hiển thị.
   - Ở bước định tuyến (Public hostname / Published application): subdomain `qa`, domain của bạn, service `HTTP` → **`127.0.0.1:3000`** (không dùng `localhost:3000`: app chỉ nghe IPv4, trên Windows `localhost` có thể được phân giải sang IPv6 trước).
   - **Không** tạo route nào trỏ tới cổng 8081 (LanguageTool).
4. Đăng ký lịch sao lưu hằng đêm bằng Task Scheduler (lệnh ở README, mục "Lịch sao lưu"), rồi chạy thử một lần bằng `Start-ScheduledTask`.
5. Kiểm tra từ điện thoại (dùng 4G, không bắt wifi văn phòng):
   - Mở `https://qa.<domain>` thì phải hiện trang đăng nhập.
   - Đăng nhập, tải thử 5 mockup.
6. **Khởi động lại máy server** mà không đăng nhập Windows. Đợi 2 phút rồi mở lại `https://qa.<domain>`: phải vào được và badge LanguageTool màu xanh.

**Trạng thái (2026-10-12):** phần code đã xong, phần trên máy server chưa làm.
- `scripts/deploy.ps1`: kiểm tra trước (quyền Administrator, NSSM, service, Node ≥ 24 / npm ≥ 11.19, `.env.local` đủ biến và không có `CLAUDE_MOCK=1`) rồi mới dừng service. Thứ tự: git pull → dừng service → `npm ci` → build → sao lưu DB → migration → chạy service → đợi `/login` trả lời 200 (tối đa 60 giây, không được thì in 30 dòng cuối `app.log`). Có `-CheckOnly`, `-SkipPull`, `-NoService`. Đã chạy thử phần kiểm tra với 5 trường hợp; các bước dừng/chạy service chỉ chạy thử được trên máy server.
- `scripts/backup-dictionary.ps1` + `npm run db:backup`: **khác với prompt ở trên**, không copy file `app.db` thô. DB chạy chế độ WAL nên copy thô có thể thiếu dữ liệu còn trong file `-wal` (đã thử: bản copy thô thấy 0 từ, bản backup thấy đủ 1 từ). Dùng SQLite backup API (an toàn khi app đang chạy), kiểm tra `integrity_check`, ra một file duy nhất, giữ 30 bản mới nhất.
- Rà soát bảo mật:
  - Mọi route API tự kiểm tra phiên, có test `app/api/routes-auth.test.ts` canh cho route mới.
  - Log: lỗi không rõ nguồn gốc chỉ ghi tên loại lỗi, không ghi message (có thể chứa nội dung phản hồi).
  - App và LanguageTool chỉ nghe 127.0.0.1 (`LT_URL` mặc định đổi sang `127.0.0.1`).
  - Bản production kiểm tra cấu hình đăng nhập ngay lúc khởi động.
  - Thêm header bảo mật cơ bản và bỏ `X-Powered-By`.
  - Chuyển CLI `shadcn` sang devDependencies: `npm audit --omit=dev` còn 0 lỗ hổng (trước đó 7 lỗ hổng mức high, đều đến từ CLI này).

---

## Giai đoạn 7 (tùy chọn) — Dữ liệu n-gram cho LanguageTool

Làm sau khi tool đã chạy ổn định. Mục đích là để LanguageTool bắt thêm lỗi dùng sai từ.

1. Tải gói n-gram **chỉ cho `de`, `fr`, `es`** từ `https://languagetool.org/download/ngram-data/`, giải nén vào `C:\LanguageTool\ngrams\` (mỗi ngôn ngữ một thư mục con `de`, `fr`, `es`). Đây là 3 ngôn ngữ chính của tool. Bỏ `en`: tiếng Anh là phụ mà gói `en` lại lớn nhất. Xem dung lượng từng gói trên trang tải trước khi tải; nên đặt trên SSD.
2. Tạo file `C:\LanguageTool\LanguageTool-6.x\server.properties` với nội dung `languageModel=C:\\LanguageTool\\ngrams`.
3. Thêm `--config server.properties` vào tham số service (`nssm edit LanguageTool`), rồi chạy `nssm restart LanguageTool`.
4. Chạy lại `npm run eval` và so với kết quả cũ.

---

## Vận hành

- **Nhân viên:** mở `https://qa.<domain>`, đăng nhập bằng tài khoản chung. Không cần cài gì.
- **Cập nhật tool:** trên máy server chạy `scripts\deploy.ps1`.
- **Đổi mật khẩu** (ví dụ khi có người nghỉ việc):
  1. Chạy `npm run hash-password` để tạo hash mới (mật khẩu tối thiểu 16 ký tự ngẫu nhiên).
  2. Sửa `APP_PASSWORD_HASH_B64` và tăng `SESSION_VERSION` trong `.env.local`.
  3. Chạy `nssm restart PodQA`.
- **Tool không vào được:**
  1. Trên máy server, mở `services.msc` và kiểm tra 3 service **PodQA**, **LanguageTool**, **Cloudflared**.
  2. Xem log ở `C:\pod-qa\app.log` và `C:\LanguageTool\lt.log`.
  3. Vẫn không được thì khởi động lại máy.
- **Chi phí:** xem trang `/usage`. Giới hạn chi tiêu theo tháng đặt trên Anthropic Console là chốt chặn cuối cùng.
