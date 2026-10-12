# POD Text QA Dashboard

Tool nội bộ cho team POD: tải lên hàng loạt mockup → đọc chữ trên ảnh → kiểm tra chính tả/ngữ pháp bằng 2 nguồn (LanguageTool + Claude API) → **chỉ hiển thị mockup có lỗi**, kèm lỗi ở đâu và sửa thế nào → đóng phiên là mất hết.

- Volume: 400–1000 ảnh/ngày, mỗi lượt vài chục ảnh, có thể nhiều người dùng cùng lúc.
- Ngôn ngữ chữ trên ảnh: `en-US`, `de-DE`, `fr-FR`, `es-ES`.
- Ngôn ngữ giao diện và giải thích lỗi: **tiếng Việt**.
- Kế hoạch từng giai đoạn: `PLAN.md`. Làm đúng thứ tự; giai đoạn trước chạy được mới sang giai đoạn sau.

## Nguyên tắc sản phẩm

1. **Không lưu mockup.** Server xử lý ảnh **hoàn toàn trong bộ nhớ**: không ghi ảnh xuống ổ cứng, không lưu ảnh vào database, không log nội dung chữ hay ảnh.
2. **Không lưu kết quả.** Kết quả chỉ nằm trong state của tab trình duyệt. Bấm "Kết thúc phiên", đóng tab hoặc tải lại trang là mất hết.
3. **Chỉ hiển thị cái cần sửa.** Mockup không lỗi chỉ hiện dưới dạng con số.
4. **Thứ duy nhất được lưu lâu dài:**
   - từ điển team
   - bảng thống kê chi phí theo ngày (chỉ có con số, không có nội dung)

## Kiến trúc (chỉ 1 máy Windows 24/7)

```
Nhân viên (trình duyệt) ──► https://qa.<domain> ──► Cloudflare Tunnel
                                                         │
                                         Máy Windows 24/7 tại văn phòng
                                         ├─ Next.js app      127.0.0.1:3000   (Windows service, NSSM)
                                         ├─ LanguageTool     localhost:8081   (Windows service, NSSM)
                                         ├─ SQLite: data/app.db (chỉ từ điển + thống kê chi phí)
                                         └─ cloudflared                       (Windows service)
                                                         │
                                                         └──► Claude API (internet)
```

- Next.js chạy `next start -H 127.0.0.1 -p 3000`, **chỉ lắng nghe localhost**. Từ bên ngoài chỉ vào được qua Cloudflare Tunnel.
- LanguageTool chỉ lắng nghe localhost, **không đưa ra internet**. Chỉ server Next.js gọi tới nó.
- Không dùng Vercel, Blob, Postgres hay Cloudflare Access.

## Đăng nhập: 1 tài khoản chung

- Trang `/login` có tên đăng nhập + mật khẩu. Thông tin so khớp với `APP_USERNAME` và `APP_PASSWORD_HASH_B64`.
  - Hash mật khẩu bằng bcrypt hoặc argon2, rồi **mã hóa base64** trước khi đặt vào `.env`. Lý do: Next.js tự hiểu dấu `$` trong `.env` là biến, sẽ làm hỏng chuỗi hash.
  - Có script `npm run hash-password` để tạo giá trị này.
- Đăng nhập đúng thì tạo cookie phiên đã ký (`SESSION_SECRET`): `httpOnly`, `secure`, `sameSite=lax`, hạn 30 ngày. Cookie chứa `SESSION_VERSION`. Muốn đá văng mọi máy đang đăng nhập (ví dụ khi đổi mật khẩu) thì tăng `SESSION_VERSION`.
- Middleware chặn mọi route trừ `/login` và static. Mọi route API đều kiểm tra phiên.
- Chống dò mật khẩu: sai 5 lần thì khóa 15 phút theo IP. Lấy IP từ header `CF-Connecting-IP`, lưu trong bộ nhớ là đủ.
- Không có tài khoản riêng từng người, không có bước chọn tên.

## Luồng xử lý

1. Người dùng chọn ảnh: nhiều file, cả thư mục (`webkitdirectory`) hoặc file `.zip` (giải nén ở client). Client giữ `File` gốc và tạo object URL để **hiển thị ảnh từ chính máy người dùng**.
2. Client resize từng ảnh (cạnh dài ≤1000px, JPEG ~0.85), rồi `POST /api/analyze` (multipart, 1 ảnh mỗi request). Hàng đợi ở client cho phép tối đa 4 request song song.
3. Server xử lý trong bộ nhớ, theo thứ tự:
   1. **Gọi Claude** vision với prompt trong `docs/claude-analyze-prompt.md`, có từ điển team trong system prompt. Validate kết quả bằng zod. Định vị từng issue: tìm lần xuất hiện thứ `occurrence` (thiếu thì mặc định 1) của `original` trong `blocks[block_index].text`.
   2. **Gọi LanguageTool.** Gom các block theo `blocks[].language`. Với mỗi ngôn ngữ, nối text các block bằng `"\n"`, gửi `POST {LT_URL}/v2/check` (form-urlencoded: `text`, `language`), rồi map `offset/length` ngược về từng block. Block `unknown` không gửi LanguageTool, chỉ dùng kết quả Claude.
   3. **Lọc và quy đổi.** Bỏ các match chính tả có từ nằm trong từ điển (đúng ngôn ngữ, không phân biệt hoa thường). Quy đổi severity theo mục "Quy đổi severity LanguageTool", rồi áp các quy tắc ngôn ngữ ở dưới.
   4. **Merge 2 nguồn**, xử lý phương án sửa, áp quy tắc "chữ in hoa thiếu dấu" của fr-FR, rồi tính `status` và "Chữ sau khi sửa".
   5. **Trả JSON về client.** Cộng token đã dùng vào bảng thống kê ngày. Buffer ảnh bị bỏ đi.
4. Client gom kết quả vào state và hiển thị:
   - Thanh tổng kết: `Đã kiểm X/Y — Lỗi A — Nghi ngờ B — Không lỗi C — Không có chữ D — Thất bại E`
   - Nhóm **Lỗi** (`error`): mở sẵn
   - Nhóm **Nghi ngờ** (`warning`): thu gọn
   - Nhóm **Thất bại**: kèm nút "Thử lại", dùng lại `File` vẫn còn trong trình duyệt
   - `ok` và `no_text`: chỉ hiện số lượng
5. Nút **"Kết thúc phiên"** xóa state và revoke toàn bộ object URL. Khi còn kết quả mà người dùng đóng hoặc tải lại tab, bật cảnh báo `beforeunload`.

### Thẻ mockup lỗi

- Ảnh thu nhỏ, bấm vào để phóng to. Kèm tên file và ngôn ngữ.
- Chữ đọc được, highlight chỗ lỗi.
- Mỗi lỗi gồm: `chữ sai → phương án sửa (1–3)`, giải thích tiếng Việt, badge nguồn (`LanguageTool` / `Claude` / `Cả 2`).
  - Issue của Claude và issue đã gộp: dùng `explanation_vi` của Claude.
  - Issue chỉ LanguageTool báo: hiện nhãn tiếng Việt theo `rule.issueType`, kèm thông báo gốc của LanguageTool (`message`). **Không gọi Claude để dịch.**

    | `issueType` | Nhãn |
    |---|---|
    | `misspelling` | Lỗi chính tả |
    | `grammar` | Lỗi ngữ pháp |
    | `duplication` | Lặp từ |
    | `typographical` | Lỗi dấu câu/trình bày |
    | còn lại | Cần xem lại |
- "Chữ sau khi sửa" của cả block, có nút copy.
- Nút "Thêm vào từ điển" cho từ bị báo nhầm. Từ được lưu ngay, và các mockup còn lại trong phiên được lọc lại ở client (tính lại `status` và "Chữ sau khi sửa").

### Quy đổi severity LanguageTool

LanguageTool không có severity. Quy đổi theo `rule.issueType` của từng match:

| `issueType` | severity |
|---|---|
| `misspelling`, `grammar`, `duplication` (ví dụ `THE THE`) | `error` |
| `uncategorized` và mọi loại khác không có trong bảng | `warning` |
| `typographical`, `style`, `whitespace` | `info` |

**Quy tắc ngôn ngữ (mục bên dưới) đứng trên bảng này.** Ví dụ: thiếu `¿ ¡` trong es-ES là `warning`, dù LanguageTool xếp vào `typographical`.

### Merge 2 nguồn

- Hai issue coi là trùng nhau khi cùng block và vùng chữ giao nhau. Gộp lại thành một issue với `sources = ["lt", "claude"]`.
- Severity của issue đã gộp:
  - Claude đánh `intentional_possible = true` hoặc severity `info` → **Claude thắng**: lấy severity và `intentional_possible` của Claude. Lý do: Claude hiểu ngữ cảnh, LanguageTool thì không. Ví dụ `GONNA`: LanguageTool báo `misspelling`, Claude báo intentional → issue là `info`, áo không bị đánh lỗi.
  - Các trường hợp còn lại → lấy severity cao hơn.
- Phương án sửa của issue đã gộp: xem mục "Phương án sửa".

### Phương án sửa

Áp cho mọi issue: của Claude, của LanguageTool hay đã gộp.

1. **Chuyển từng phương án về đúng kiểu chữ của `original`.** Chỉ xét chữ cái, bỏ qua số và dấu câu.
   - `original` in hoa toàn bộ → phương án in hoa toàn bộ (`YOUR` → `YOU'RE`).
   - `original` viết hoa chữ đầu, còn lại thường → phương án viết hoa chữ đầu, còn lại thường (`Your` → `You're`).
   - `original` thường toàn bộ → phương án thường toàn bộ.
   - `original` chỉ có 1 chữ cái in hoa (`A`, `I`) → xét cả block: block in hoa toàn bộ thì in hoa toàn bộ, ngược lại viết hoa chữ đầu (`A` → `An`, không thành `AN`).
   - Kiểu khác (ví dụ `McDonald`) → giữ nguyên phương án.
   - Đổi hoa/thường theo locale của block (`toLocaleUpperCase` / `toLocaleLowerCase`). Ví dụ `ß` in hoa thành `SS`, khớp quy tắc de-DE.
2. **Bỏ trùng, không phân biệt hoa thường.**
3. **Sắp xếp và giới hạn.** Issue đã gộp: phương án của Claude trước, của LanguageTool sau. Giữ tối đa 3.

### Cách tính `status`

Issue `info` vẫn hiện trong thẻ nhưng **không tính vào `status`**.

- `error`: có issue severity `error` được cả 2 nguồn cùng báo, hoặc Claude báo `error` với `intentional_possible = false`
- `warning`: có issue `error`/`warning` chỉ 1 nguồn báo, hoặc có issue loại `ocr_uncertain`
- `ok`: không có issue `error`/`warning` nào. Mockup chỉ có issue `info` cũng là `ok` (nhóm "Không lỗi").
- `no_text`: ảnh không có chữ
- `failed`: lỗi xử lý, trả về kèm lý do

### Chữ sau khi sửa

Code tự tính cho từng block, Claude không trả trường này. Cách tính: áp phương án đầu tiên (đã chuyển kiểu chữ ở mục trên) của mỗi issue `error`/`warning` có `intentional_possible = false`.

Các hàm quy đổi, gắn nhãn, merge, xử lý phương án sửa, tính `status` và tính chữ sau khi sửa đặt trong module dùng chung, để client gọi lại được sau khi thêm từ vào từ điển.

### Khi có sự cố

- **LanguageTool lỗi hoặc tắt**: vẫn trả kết quả Claude, kèm `lt_status = "offline"`. UI hiện banner "LanguageTool đang lỗi, kết quả chỉ từ Claude".
- **LanguageTool chậm ở lần gọi đầu**: xem mục "LanguageTool: timeout và nạp sẵn".
- **Claude trả lỗi 429/529**: retry với backoff.
- **JSON từ Claude sai schema**: retry 1 lần, vẫn sai thì trả `failed`.
- **Claude bị cắt giữa chừng** (`stop_reason = "max_tokens"`): `max_tokens` mặc định ~3000. Bị cắt thì retry 1 lần với giới hạn gấp đôi (~6000), vì retry y nguyên sẽ bị cắt đúng chỗ cũ. Vẫn bị cắt thì trả `failed`.
- **Giới hạn đồng thời**: server cho phép tối đa `CLAUDE_MAX_CONCURRENCY` lời gọi Claude cùng lúc, chung cho mọi người dùng.

### LanguageTool: timeout và nạp sẵn

Lần gọi đầu tiên cho mỗi ngôn ngữ sau khi LanguageTool khởi động rất chậm, vì nó phải nạp dữ liệu ngôn ngữ. Đo trên máy dev: de-DE ~12s, fr-FR ~6s.

- **Timeout** mỗi lời gọi LanguageTool là 30s, retry 1 lần.
- **Nạp sẵn**: gửi 1 câu ngắn cố định cho mỗi ngôn ngữ (`en-US`, `de-DE`, `fr-FR`, `es-ES`).
  - Chạy nền khi app khởi động, **không chặn** app khởi động.
  - LanguageTool chưa sẵn sàng thì thử lại với backoff, đến khi nạp xong.
  - Chạy lại mỗi khi `/api/lt-health` thấy LanguageTool chuyển sang online từ `offline` hoặc `unknown`.
  - Trạng thái lần kiểm tra trước lưu trên `globalThis`, để không bị reset khi hot reload ở dev. Giá trị ban đầu là `"unknown"`, nên lần health check thành công đầu tiên cũng kích hoạt nạp sẵn.
  - Đang có một lượt nạp sẵn chạy thì không mở thêm lượt mới. Cờ "đang nạp sẵn" cũng lưu trên `globalThis`.

## Dữ liệu lưu lâu dài (SQLite, `DATABASE_PATH`)

- `dictionary`: id, language, word, note, created_at. Ràng buộc unique (language, lower(word)).
- `usage_daily`: date, images, input_tokens, output_tokens. Chỉ chứa con số.

## Quy tắc ngôn ngữ (áp vào prompt Claude và bộ lọc LanguageTool)

Chữ trên áo thường IN HOA toàn bộ, dùng font cách điệu, câu ngắn, hay có slang. Với kết quả LanguageTool, các quy tắc này đứng trên bảng quy đổi severity.

- **en-US**
  - Slang có chủ đích (`ain't`, `gonna`, `rollin'`) là phong cách, không phải lỗi; gắn `intentional_possible`.
  - Vẫn phải bắt các lỗi kinh điển: your/you're, its/it's, there/their, `ya'll` → `y'all`, lose/loose.
- **de-DE**
  - Chữ in hoa toàn bộ: bỏ qua quy tắc viết hoa danh từ. `SS` thay cho `ß` là hợp lệ.
  - Vẫn phải bắt: sai đuôi từ, sai giống hoặc cách, mất umlaut (`FUR` → `FÜR`).
- **fr-FR**
  - Thiếu dấu trên chữ in hoa (`ETE` thay vì `ÉTÉ`) → `info`.
    - Cách nhận biết (LanguageTool thường báo những chỗ này là `misspelling`): `original` in hoa toàn bộ, và **bất kỳ** phương án nào trong danh sách đã xử lý (tối đa 3, gồm của cả LanguageTool lẫn Claude) chỉ khác `original` ở dấu. "Chỉ khác ở dấu" nghĩa là bỏ dấu và bỏ phân biệt hoa thường thì giống hệt. Ví dụ phương án `ETC, ÉTÉ` vẫn hạ xuống `info` nhờ `ÉTÉ`.
    - Áp lên issue **sau khi merge** và xử lý phương án sửa, trước khi tính `status`.
    - Quy tắc này **chỉ áp cho fr-FR**. Ở es-ES (`TU` → `TÚ`) và de-DE (`FUR` → `FÜR`), thiếu dấu vẫn là `error`.
  - Thiếu dấu cách trước `! ? : ;` → `info`.
  - Vẫn phải bắt: sai hợp giống/số, sai dấu trên chữ thường.
- **es-ES**
  - Thiếu `¿ ¡` → `warning`.
  - Thiếu dấu làm đổi nghĩa (`TU/TÚ`, `SI/SÍ`, `EL/ÉL`, `MAS/MÁS`) → `error`.
- Thuật ngữ Native American, tên bộ tộc, tên thương hiệu, tên riêng: không bao giờ báo lỗi nếu có trong từ điển.

## Stack và quy ước code

- Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui
- `better-sqlite3` + Drizzle cho SQLite
- `@anthropic-ai/sdk`. Model lấy từ env `CLAUDE_MODEL`, không hardcode.
  - Dùng output có cấu trúc: tool use với `input_schema`, hoặc structured outputs nếu SDK hiện hành hỗ trợ.
  - Cache system prompt và từ điển bằng prompt caching. Mỗi model có ngưỡng độ dài tối thiểu để cache; kiểm tra `cache_read_input_tokens` thực tế. Prompt chưa đủ dài thì chấp nhận không cache; từ điển lớn dần thì cache sẽ tự có tác dụng.
- zod validate mọi input API và mọi output của Claude. Không dùng `any`.
- Trước khi viết code dùng Anthropic SDK hoặc Drizzle, **tra docs hiện hành**.
- Ngôn ngữ:
  - Text hiển thị cho người dùng viết bằng tiếng Việt.
  - Tên biến, code và commit viết bằng tiếng Anh.
- Commit nhỏ.
- Không log nội dung ảnh, chữ đọc được hay secret. Chỉ log số lượng và lỗi kỹ thuật.

## Biến môi trường (`.env.local` trên máy server)

```
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-sonnet-5-5
CLAUDE_MAX_CONCURRENCY=8
LT_URL=http://localhost:8081
APP_USERNAME=
APP_PASSWORD_HASH_B64=
SESSION_SECRET=
SESSION_VERSION=1
DATABASE_PATH=./data/app.db
```

## Môi trường dev

Máy dev cần Node.js 20+, Git, Java 21 và chạy LanguageTool bằng `scripts/start-languagetool.bat`. Script này chỉ dùng cho máy dev; máy server chạy LanguageTool như một Windows service.
