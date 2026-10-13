# POD Text QA Dashboard

Tool nội bộ cho team POD: tải lên hàng loạt mockup → đọc chữ trên ảnh → kiểm tra chính tả/ngữ pháp bằng 2 nguồn (LanguageTool + Claude API) → **chỉ hiển thị mockup có lỗi**, kèm lỗi ở đâu và sửa thế nào → đóng phiên là mất hết.

- Volume: 400–1000 ảnh/ngày, mỗi lượt vài chục ảnh, có thể nhiều người dùng cùng lúc.
- Ngôn ngữ được kiểm: `de-DE`, `fr-FR`, `es-ES`. **Không kiểm tiếng Anh:** ảnh có chữ tiếng Anh vào nhóm Nghi ngờ kèm ghi chú "Chữ tiếng Anh: tool không kiểm, cần xem tay" (xem "Quy tắc ngôn ngữ").
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
                                         ├─ LanguageTool     127.0.0.1:8081   (Windows service, NSSM)
                                         ├─ SQLite: data/app.db (chỉ từ điển + thống kê chi phí)
                                         └─ cloudflared                       (Windows service)
                                                         │
                                                         └──► Claude API (internet)
```

- Next.js chạy `next start -H 127.0.0.1 -p 3000`, **chỉ lắng nghe localhost**. Từ bên ngoài chỉ vào được qua Cloudflare Tunnel.
- LanguageTool chỉ lắng nghe localhost, **không đưa ra internet**. Chỉ server Next.js gọi tới nó, qua `127.0.0.1` (không dùng `localhost`, vì trên Windows `localhost` có thể được phân giải sang IPv6 trước). Route của Cloudflare Tunnel cũng trỏ tới `127.0.0.1:3000`.
- Mọi response có header bảo mật cơ bản (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) và không có `X-Powered-By` (`next.config.ts`). Không dùng CSP vì script inline của Next.js cần nonce theo từng request.
- Triển khai bằng `scripts/deploy.ps1`; sao lưu DB bằng `scripts/backup-dictionary.ps1` (SQLite backup API, không copy file thô vì DB chạy chế độ WAL). Hướng dẫn ở `README.md`.
- Không dùng Vercel, Blob, Postgres hay Cloudflare Access.

## Đăng nhập: 1 tài khoản chung

- Trang `/login` có tên đăng nhập + mật khẩu. Thông tin so khớp với `APP_USERNAME` và `APP_PASSWORD_HASH_B64`.
  - Hash mật khẩu bằng bcrypt hoặc argon2, rồi **mã hóa base64** trước khi đặt vào `.env`. Lý do: Next.js tự hiểu dấu `$` trong `.env` là biến, sẽ làm hỏng chuỗi hash.
  - Có script `npm run hash-password` để tạo giá trị này.
- Đăng nhập đúng thì tạo cookie phiên đã ký (`SESSION_SECRET`): `httpOnly`, `secure`, `sameSite=lax`, hạn 30 ngày. Cookie chứa `SESSION_VERSION`. Muốn đá văng mọi máy đang đăng nhập (ví dụ khi đổi mật khẩu) thì tăng `SESSION_VERSION`.
- Proxy (`proxy.ts`) chặn mọi route trừ `/login` và static. Mọi route API **tự** kiểm tra phiên ở từng handler (`if (!(await hasValidSession())) return unauthorizedResponse();`); test `app/api/routes-auth.test.ts` bắt lỗi nếu route mới quên. Route công khai duy nhất: `/api/auth/login` và `/api/auth/logout`.
- Chống dò mật khẩu: sai 5 lần thì khóa 15 phút theo IP. Lấy IP từ header `CF-Connecting-IP`, lưu trong bộ nhớ là đủ.
- Không có tài khoản riêng từng người, không có bước chọn tên.

## Luồng xử lý

1. Người dùng chọn ảnh: nhiều file, cả thư mục (`webkitdirectory`) hoặc file `.zip` (giải nén ở client). Client giữ `File` gốc và tạo object URL để **hiển thị ảnh từ chính máy người dùng**.
2. Client resize từng ảnh (cạnh dài ≤1000px, JPEG ~0.85), rồi `POST /api/analyze` (multipart, 1 ảnh mỗi request, kèm tên file gốc ở trường `fileName`). Hàng đợi ở client cho phép tối đa 4 request song song.
   - Ảnh có nền trong suốt được ghép lên nền **xám trung tính** trước khi nén JPEG. Lý do: ghép lên nền trắng sẽ làm mất chữ trắng (thiết kế cho áo tối màu), nền đen sẽ làm mất chữ đen.
3. Server xử lý trong bộ nhớ, theo thứ tự:
   1. **Gọi Claude** vision với prompt trong `docs/claude-analyze-prompt.md`, có từ điển team trong system prompt. Validate kết quả bằng zod. Định vị từng issue: tìm lần xuất hiện thứ `occurrence` (thiếu thì mặc định 1) của `original` trong `blocks[block_index].text`.
   2. **Gọi LanguageTool.** Gom các block theo `blocks[].language`. Với mỗi ngôn ngữ, nối text các block bằng `"\n"`, gửi `POST {LT_URL}/v2/check` (form-urlencoded: `text`, `language`), rồi map `offset/length` ngược về từng block. Block `unknown` và block tiếng Anh không gửi LanguageTool, chỉ dùng kết quả Claude.
      - **LanguageTool kiểm bản chữ thường của block IN HOA** (`languageToolText()`). Claude trả thêm `normal_case`: cùng chữ đó viết hoa/thường bình thường (đầu câu, tên riêng, danh từ tiếng Đức viết hoa), chỉ đổi hoa/thường. Lý do: với chữ IN HOA, LanguageTool gần như không bắt được lỗi hợp giống/số (`MEINE HUND`, `PARFAIT`, `ORGULLOSO`, `EL MEJOR MAMÁ`); với chữ thường thì bắt được. Tiếng Đức cần danh từ viết hoa đúng: chữ thường toàn bộ thì LanguageTool chỉ báo danh từ viết thường, không thấy lỗi ngữ pháp, nên phải nhờ Claude.
      - Chỉ dùng `normal_case` khi nó cùng độ dài và cùng chữ cái với chữ gốc ở mọi vị trí (bỏ qua hoa/thường; khoảng trắng nào cũng khớp với khoảng trắng nào, vì Claude đôi khi nối các dòng bằng dấu cách), để vị trí lỗi khớp 1:1. Không thì gửi chữ gốc. Phương án của LanguageTool khi đó ở dạng chữ thường, được chuyển về kiểu chữ của `original` ở bước "Phương án sửa"; mọi so sánh phương án với `original` trong bộ lọc đều không phân biệt hoa/thường.
   3. **Lọc và quy đổi.** Bỏ các **lỗi chính tả** (Claude: `spelling`, `capitalization`, `accent`; LanguageTool: `misspelling`) có `original` nằm trong từ điển (đúng ngôn ngữ, so theo `word_key`); với cụm nhiều từ thì **mọi từ** trong cụm phải có trong từ điển. Áp cho **cả 2 nguồn**, để thêm từ vào từ điển thì lỗi Claude báo cũng biến mất. Lỗi ngữ pháp, dấu câu, chọn từ… không bao giờ bị từ điển che (ví dụ có `meine` trong từ điển vẫn phải bắt `ICH LIEBE MEINE HUND`). Quy đổi severity theo mục "Quy đổi severity LanguageTool", rồi áp các quy tắc ngôn ngữ ở dưới. Match của LanguageTool nằm trên chỗ `[?]` (chữ Claude không đọc được) thì bỏ, vì sự không chắc chắn đó đã có issue `ocr_uncertain` của Claude.
      - Gọi LanguageTool lỗi ở bất kỳ ngôn ngữ nào thì coi cả lượt là `offline` và bỏ toàn bộ kết quả LanguageTool của ảnh đó, không trộn kết quả nửa vời.
   4. **Merge 2 nguồn**, xử lý phương án sửa, áp quy tắc "chữ in hoa thiếu dấu" của fr-FR, rồi tính `status` và "Chữ sau khi sửa".
   5. **Trả JSON về client.** Cộng token đã dùng vào bảng thống kê ngày. Buffer ảnh bị bỏ đi.
      - JSON gồm `result` (kết quả đã tính) và `input` (kết quả thô của Claude và các match LanguageTool đã map về block). Client giữ `input` để chạy lại `analyzeTexts()` (`lib/analysis/pipeline.ts`) khi từ điển thay đổi, không cần gọi lại server. Kiểu dữ liệu ở `lib/analysis/api-types.ts`.
4. Client gom kết quả vào state và hiển thị:
   - Thanh tổng kết: `Đã kiểm X/Y — Lỗi A — Nghi ngờ B — Không lỗi C — Không có chữ D — Thất bại E`
   - Nhóm **Lỗi** (`error`): mở sẵn
   - Nhóm **Nghi ngờ** (`warning`): thu gọn
   - Nhóm **Thất bại**: kèm nút "Thử lại", dùng lại `File` vẫn còn trong trình duyệt
   - `ok` và `no_text`: chỉ hiện số lượng
   - "Đã kiểm X/Y": X gồm cả ảnh đã xong và ảnh thất bại.
   - Banner "LanguageTool đang lỗi, kết quả chỉ từ Claude" khi có ảnh trả về `ltStatus = "offline"`. Ở chế độ mock có thêm banner báo kết quả Claude là dữ liệu mẫu.
   - Phiên đăng nhập hết hạn giữa chừng (bất kỳ request nào trả 401, kể cả health check của badge):
     - **Tạm dừng cả hàng đợi.** Ảnh đang gửi dở được đưa về đầu hàng chờ, không ảnh nào bị đánh dấu Thất bại.
     - Hiện banner "Phiên đăng nhập hết hạn — đăng nhập lại để tiếp tục" trên mọi trang, kèm nút mở `/login?next=/reauth` ở tab mới. Badge trên header cũng báo hết hạn.
     - Trong lúc chờ, client gọi `GET /api/session` mỗi 3 giây và mỗi khi tab được focus. Đăng nhập lại xong (ở bất kỳ tab nào) thì tự chạy tiếp hàng đợi.
     - **Không tự chuyển sang `/login`**, vì chuyển trang sẽ mất toàn bộ kết quả của phiên.
   - File `.zip` và thư mục: chỉ lấy JPG/PNG/WebP. Bỏ qua file khác, file ẩn (tên bắt đầu bằng `.`) và thư mục `__MACOSX`. Sau khi thêm, báo số ảnh đã thêm và số file bị bỏ qua.
   - Ảnh thu nhỏ có nền ô bàn cờ xám, để thiết kế nền trong suốt có chữ trắng vẫn nhìn thấy được.
5. **Phiên kiểm tra** (File, object URL, kết quả, hàng đợi) nằm trong store client `SessionProvider` (`components/session/session-provider.tsx`) gắn ở root layout. Chuyển trang trong app (`/`, `/dictionary`, `/usage`...) **không** mất kết quả. Phiên chỉ mất khi:
   - đóng tab hoặc tải lại trang (có cảnh báo `beforeunload` khi còn ảnh trong phiên);
   - bấm **"Kết thúc phiên"**: xóa state, hủy request đang chạy, revoke toàn bộ object URL. Có hộp xác nhận, nhưng bỏ qua khi chưa có ảnh nào xong (chưa có gì để mất);
   - **đăng xuất**: kết thúc phiên luôn, vì tài khoản dùng chung không được để lại kết quả cho người sau. Còn ảnh trong phiên thì hỏi xác nhận trước.

### Thẻ mockup lỗi

- Ảnh thu nhỏ, bấm vào để phóng to. Kèm tên file và ngôn ngữ.
- Block chữ tiếng Anh: hiện chữ, kèm dòng "Chữ tiếng Anh: tool không kiểm, cần xem tay." (không có lỗi hay phương án sửa).
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
- Phương án đầu tiên thêm ký tự đặc biệt mà `original` không có (chữ có dấu như `Ä Ö Ü ß É È Ç Ñ`, và `¿ ¡`; `addedSpecialCharacters()`) → thêm dòng nhắc "Nếu font không có ký tự này (Ü), hãy đổi font." Font thiếu ký tự là lý do hay gặp khiến dấu bị mất.
- "Chữ sau khi sửa" của cả block, có nút copy.
- Nút "Thêm vào từ điển" cho từ bị báo nhầm. Từ được lưu ngay, và các mockup còn lại trong phiên được lọc lại ở client (tính lại `status` và "Chữ sau khi sửa").
  - Chỉ hiện với **lỗi chính tả** (loại mà từ điển áp dụng, xem bước 3 "Lọc và quy đổi"), khi biết ngôn ngữ của block, và không hiện cho chỗ đọc không rõ (`[?]`, `ocr_uncertain`).
  - `original` là một từ → nút "Thêm vào từ điển" (từ đã bỏ dấu câu ở hai đầu, ví dụ `YOU'RE!` → `YOU'RE`).
  - `original` là cụm nhiều từ → nút **"Thêm từng từ…"** mở popover có chip cho từng từ (tách bằng `splitWords()`, giữ dấu nháy/gạch nối bên trong từ, bỏ trùng). Bấm chip nào thêm từ đó; chip của từ đã có trong từ điển hiện dấu ✓. Lỗi của cả cụm biến mất khi mọi từ đã có.
  - Lưu xong hiện toast xác nhận có nút **"Hoàn tác"**: xóa đúng từ vừa thêm, các lỗi liên quan hiện lại. Từ đã có sẵn thì chỉ báo "đã có trong từ điển" (không có Hoàn tác, để không xóa nhầm từ có từ trước).
  - Cơ chế lọc lại: `SessionProvider` giữ bản sao từ điển. Sau mỗi thay đổi từ điển (ở thẻ hoặc ở `/dictionary`), store tải lại danh sách rồi chạy lại `analyzeTexts()` trên `input` thô của mọi ảnh đã xong. Ảnh xong sau thời điểm đó cũng được lọc bằng từ điển mới nhất.

### Quy đổi severity LanguageTool

LanguageTool không có severity. Quy đổi theo `rule.issueType` của từng match:

| `issueType` | severity |
|---|---|
| `misspelling`, `grammar`, `duplication` (ví dụ `THE THE`) | `error` |
| `uncategorized` và mọi loại khác không có trong bảng | `warning` |
| `typographical`, `style`, `whitespace` | `info` |

**Quy tắc ngôn ngữ (mục bên dưới) đứng trên bảng này.** Ví dụ: thiếu `¿ ¡` trong es-ES là `warning`, dù LanguageTool xếp vào `typographical`.

### Merge 2 nguồn

- Hai issue coi là trùng nhau khi cùng block và vùng chữ giao nhau. Gộp lại thành một issue với `sources = ["lt", "claude"]`. Một issue của Claude có thể gộp nhiều match LanguageTool.
- **Vùng chữ của issue đã gộp là hợp của các vùng**, và mọi phương án sửa được dời về vùng chung đó. Ví dụ Claude báo `chose` → `choses`, LanguageTool báo `petites chose` → `petites choses`: issue gộp có `original` là `petites chose`, phương án của Claude thành `petites choses`. Lý do: nếu không dời, áp phương án của LanguageTool vào chỗ `chose` sẽ ra `petites petites choses`.
- Severity của issue đã gộp:
  - Claude đánh `intentional_possible = true` hoặc severity `info` → **Claude thắng**: lấy severity và `intentional_possible` của Claude. Lý do: Claude hiểu ngữ cảnh, LanguageTool thì không. Ví dụ `HAB DICH LIEB`: LanguageTool báo `HAB` là `misspelling`, Claude báo intentional (cách nói thân mật của `HABE`) → issue là `info`, áo không bị đánh lỗi.
  - Các trường hợp còn lại → lấy severity cao hơn (giữa Claude và match LanguageTool nặng nhất).
- Issue của Claude không tìm thấy `original` trong block thì không gộp, không highlight, không áp vào "Chữ sau khi sửa", và bị hạ xuống tối đa `warning`.
- Phương án sửa của issue đã gộp: xem mục "Phương án sửa".

### Phương án sửa

Áp cho mọi issue: của Claude, của LanguageTool hay đã gộp.

0. **Cắt phần lặp lại chữ xung quanh** (`trimSuggestionContext()`). Phương án chỉ thay đúng vùng chữ của issue (prompt cũng dặn vậy), nhưng model đôi khi viết cả cụm (`FREIND` → `BEST FRIEND` trong `BEST FREIND`), áp vào sẽ lặp chữ. Các từ đầu phương án trùng với các từ ngay trước vùng chữ, và các từ cuối trùng với các từ ngay sau, bị cắt (không phân biệt hoa thường, giữ ít nhất 1 từ). Cắt xong mà giống `original` thì phương án bị bỏ ở bước 2.
1. **Chuyển từng phương án về đúng kiểu chữ của `original`.** Chỉ xét chữ cái, bỏ qua số và dấu câu.
   - `original` in hoa toàn bộ → phương án in hoa toàn bộ (`FETE` → `FÊTE`).
   - `original` viết hoa chữ đầu, còn lại thường → phương án viết hoa chữ đầu, còn lại thường (`Fete` → `Fête`).
   - `original` thường toàn bộ → phương án thường toàn bộ.
   - `original` chỉ có 1 chữ cái in hoa (`A`, `I`) → xét cả block: block in hoa toàn bộ thì in hoa toàn bộ, ngược lại viết hoa chữ đầu (`A` → `An`, không thành `AN`).
   - Kiểu khác (ví dụ `McDonald`) → giữ nguyên phương án.
   - Đổi hoa/thường theo locale của block (`toLocaleUpperCase` / `toLocaleLowerCase`). Ví dụ `ß` in hoa thành `SS`, khớp quy tắc de-DE.
2. **Bỏ trùng, không phân biệt hoa thường.** Bỏ luôn phương án giống hệt `original` (ví dụ Claude gợi ý `HAIDA` cho `HAIDA` nghĩa là "giữ nguyên"; ý đó đã nằm trong giải thích).
3. **Sắp xếp và giới hạn.** Issue đã gộp: phương án của Claude trước, của LanguageTool sau. Giữ tối đa 3.

### Cách tính `status`

Issue `info` vẫn hiện trong thẻ nhưng **không tính vào `status`**.

**Lỗi chính tả LanguageTool chấp nhận** (`applyLtAcceptedSpellingRule()`): issue loại `spelling` **chỉ Claude báo**, trên block mà LanguageTool đã kiểm (`lt_status = "online"` và block có ngôn ngữ riêng rõ ràng) nhưng không có match → tối đa `warning`, gắn `ltAccepted`, **không áp vào "Chữ sau khi sửa"**. Thẻ ghi "LanguageTool coi là đúng, chưa áp vào chữ sửa".
- Lý do: từ điển của LanguageTool rất chắc về chính tả, còn Claude đôi khi báo nhầm dạng từ đúng nhưng ít gặp (`ICH WOG MAL`: `wog` là quá khứ của `wiegen`).
- **Ngoại lệ:** không áp khi một phương án chỉ khác `original` ở dấu hoặc ký tự đặc biệt (`differsOnlyBySpecialCharacters()`: `ANO` → `AÑO`, `TU` → `TÚ`, `SI` → `SÍ`, `FUR` → `FÜR`, `ss` → `ß`, thêm `¿ ¡`). LanguageTool chấp nhận `ANO` vì đó là từ có thật; các quy tắc ngôn ngữ quyết định những ca này.
- Lỗi ngữ pháp, hợp giống, chọn từ… không bị ảnh hưởng.

**Lỗi không có cách sửa** (`applyNoFixRule()`): issue `error` **chỉ Claude báo** mà không còn phương án nào (sau khi cắt phần lặp và bỏ phương án trùng `original`) → tối đa `warning`. Claude không đưa được cách sửa nghĩa là không chắc; Sonnet từng báo nhầm `ICH WOG MAL` theo cách này (loại `grammar`, không phương án). Không áp khi LanguageTool cũng báo cùng chỗ.

- `error`: có issue severity `error` được cả 2 nguồn cùng báo, hoặc Claude báo `error` với `intentional_possible = false`
- `warning`: còn issue `error`/`warning` nào đó mà không đủ điều kiện `error` ở trên, hoặc có issue loại `ocr_uncertain` (kể cả severity `info`). Gồm: issue chỉ 1 nguồn báo, và issue `warning` cả 2 nguồn cùng báo (ví dụ tên riêng `HAIDA`: Claude báo warning có chủ đích, LanguageTool báo misspelling). Cũng là `warning` khi ảnh có chữ tiếng Anh (không kiểm, cần xem tay).
- `ok`: không có issue `error`/`warning` nào và không có chữ tiếng Anh. Mockup chỉ có issue `info` cũng là `ok` (nhóm "Không lỗi").
- `no_text`: ảnh không có chữ
- `failed`: lỗi xử lý, trả về kèm lý do

### Chữ sau khi sửa

Code tự tính cho từng block, Claude không trả trường này. Cách tính: áp phương án đầu tiên (đã chuyển kiểu chữ ở mục trên) của mỗi issue `error`/`warning` có `intentional_possible = false`, trừ issue `ltAccepted` (xem "Cách tính `status`").

Các hàm quy đổi, gắn nhãn, merge, xử lý phương án sửa, tính `status` và tính chữ sau khi sửa đặt trong module dùng chung, để client gọi lại được sau khi thêm từ vào từ điển.

### Khi có sự cố

- **LanguageTool lỗi hoặc tắt**: vẫn trả kết quả Claude, kèm `lt_status = "offline"`. UI hiện banner "LanguageTool đang lỗi, kết quả chỉ từ Claude".
- **LanguageTool chậm ở lần gọi đầu**: xem mục "LanguageTool: timeout và nạp sẵn".
- **Claude trả lỗi 429/529**: retry với backoff. Do SDK tự làm (`maxRetries: 3`, có tôn trọng `retry-after`); lỗi vẫn còn sau đó thì trả `failed`.
- **JSON từ Claude sai schema** (kể cả `block_index` trỏ tới block không tồn tại, `original` rỗng): retry 1 lần, vẫn sai thì trả `failed`.
- **Claude từ chối** (`stop_reason = "refusal"`): trả `failed`, không retry.
- **Production thiếu cấu hình** (không có `ANTHROPIC_API_KEY`, thiếu `CLAUDE_MODEL`, có `CLAUDE_MOCK=1`, thiếu biến đăng nhập, `SESSION_SECRET` ngắn hơn 32 ký tự, hoặc `APP_PASSWORD_HASH_B64` không phải bcrypt mã hóa base64): server **dừng ngay khi khởi động** (`process.exit(1)`), log ghi rõ biến nào sai (chỉ tên, không ghi giá trị). Lý do: nếu chỉ ném lỗi, Next.js vẫn chạy tiếp ở trạng thái hỏng.
- **Claude bị cắt giữa chừng** (`stop_reason = "max_tokens"`): `max_tokens` mặc định ~3000. Bị cắt thì retry 1 lần với giới hạn gấp đôi (~6000), vì retry y nguyên sẽ bị cắt đúng chỗ cũ. Vẫn bị cắt thì trả `failed`.
- **Giới hạn đồng thời**: server cho phép tối đa `CLAUDE_MAX_CONCURRENCY` lời gọi Claude cùng lúc, chung cho mọi người dùng.

### LanguageTool: timeout và nạp sẵn

Lần gọi đầu tiên cho mỗi ngôn ngữ sau khi LanguageTool khởi động rất chậm, vì nó phải nạp dữ liệu ngôn ngữ. Đo trên máy dev: de-DE ~12s, fr-FR ~6s.

- **Timeout** mỗi lời gọi LanguageTool là 30s, retry 1 lần.
- **Nạp sẵn**: gửi 1 câu ngắn cố định cho mỗi ngôn ngữ được kiểm (`de-DE`, `fr-FR`, `es-ES`).
  - **Mỗi câu có 1 lỗi chính tả cố ý** (ví dụ `Das ist ein kurzer Tset.`). Lý do: câu đúng hoàn toàn không làm LanguageTool nạp phần tạo gợi ý sửa chính tả, nên lỗi thật đầu tiên vẫn chậm. Đo trên máy dev, lần check tiếng Đức đầu tiên: không nạp sẵn ~12s, câu không lỗi ~4,1s, câu có lỗi ~2,8s (gần mức ổn định ~1,5–2s).
  - Chạy nền khi app khởi động, **không chặn** app khởi động.
  - LanguageTool chưa sẵn sàng thì thử lại với backoff (1s, gấp đôi mỗi lần, tối đa 60s), đến khi nạp xong.
  - Chạy lại mỗi khi `/api/lt-health` thấy LanguageTool chuyển sang online từ `offline` hoặc `unknown`.
  - Trạng thái lần kiểm tra trước lưu trên `globalThis`, để không bị reset khi hot reload ở dev. Giá trị ban đầu là `"unknown"`, nên lần health check thành công đầu tiên cũng kích hoạt nạp sẵn.
  - Nạp sẵn xong thì đặt trạng thái là `"online"`. Lý do: nếu không, lần health check thành công đầu tiên sau khi khởi động vẫn thấy `unknown` → `online` và nạp sẵn thêm lần nữa.
  - Đang có một lượt nạp sẵn chạy thì không mở thêm lượt mới. Cờ "đang nạp sẵn" cũng lưu trên `globalThis`.
  - **Đánh thức lượt đang chờ:** nếu lượt nạp sẵn đang ngủ chờ backoff mà health check thấy LanguageTool vừa online, thì cắt ngang lần chờ đó để thử lại ngay. Vẫn chỉ có 1 lượt chạy. Lý do: không có bước này, LanguageTool lên đúng lúc backoff đang ở 60s thì phải chờ thêm tới 60s mới nạp, trong khi request thật phải chịu chậm.

## Dữ liệu lưu lâu dài (SQLite, `DATABASE_PATH`)

- `dictionary`: id, language, word, word_key, note, created_at. Ràng buộc unique (language, word_key).
  - `word`: chữ như người dùng nhập, dùng để hiển thị.
  - `word_key`: do code tính bằng `toWordKey()`: chuẩn hóa NFC, rồi `toLocaleLowerCase` theo ngôn ngữ; riêng de-DE đổi `ß` → `ss`. Nhờ vậy `FÜR`/`für` và `STRASSE`/`straße` là cùng một từ.
  - Lý do không dùng `lower(word)` của SQLite: hàm này chỉ đổi hoa/thường cho chữ không dấu, nên coi `FÜR` và `für` là hai từ khác nhau.
  - Mọi chỗ so khớp với từ điển (lọc lỗi ở server, lọc lại ở client, kiểm tra trùng khi thêm từ) đều so theo `word_key` và đúng ngôn ngữ.
- Trang `/dictionary`: thêm từ (ngôn ngữ, từ, ghi chú; báo trước nếu trùng theo `word_key`), lọc theo ngôn ngữ, tìm kiếm, xóa (toast có "Hoàn tác" thêm lại đúng từ và ghi chú đó), nhập/xuất CSV.
  - CSV: dòng đầu `language,word,note` (cột `note` không bắt buộc, thứ tự cột tùy ý), UTF-8, file xuất có BOM để Excel đọc đúng dấu. Nhập tối đa 1 MB / 5000 dòng, đi qua `addDictionaryWord()` trong một transaction: từ đã có thì bỏ qua, dòng lỗi (sai ngôn ngữ, từ rỗng…) được báo số dòng.
  - API (đều kiểm tra phiên): `GET`/`POST /api/dictionary`, `DELETE /api/dictionary/[id]`, `GET /api/dictionary/export`, `POST /api/dictionary/import`.
- `usage_daily`: date, model, images, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens. Khóa chính (date, model). Chỉ chứa con số.
  - Bốn cột token tách riêng vì mỗi loại tính giá khác nhau: `input_tokens` chỉ là token vào **không cache**; `cache_read_tokens` / `cache_write_tokens` là token đọc / ghi cache.
  - `model`: model trả lời (lấy từ phản hồi API, có thể khác `CLAUDE_MODEL` nếu refusal fallback chạy); lần gọi thất bại mà không có phản hồi thì dùng `CLAUDE_MODEL`. Tách theo model để so Sonnet/Haiku.
  - `date` theo giờ địa phương của máy server. Mỗi ảnh đã tới được Claude cộng 1 vào `images`, kể cả khi kết quả cuối là `failed`, vì mọi lần gọi đều tốn tiền. Token của mọi lần retry đều được cộng.
  - Chế độ mock không ghi vào bảng này.
  - Trang `/usage` (không quy ra USD; có link "Xem chi phí thực tế trên Anthropic Console"):
    - 4 ô số của tháng hiện tại: ảnh (kèm token/ảnh, tháng trước), token vào (tổng, kèm phần không cache / đọc cache / ghi cache), token ra, tỉ lệ cache hit.
    - Bảng tháng này theo model, và bảng 62 ngày gần nhất theo ngày × model. Cột: ảnh, vào (không cache), đọc cache, ghi cache, ra, cache hit, token/ảnh.
    - Tỉ lệ cache hit = đọc cache / (không cache + đọc cache + ghi cache). Token/ảnh = mọi token (vào các loại + ra) / số ảnh.
    - Đọc thẳng SQLite trong server component (`await connection()` trong `<Suspense>`). Ở chế độ mock có banner nhắc mock không được tính.

## Quy tắc ngôn ngữ (áp vào prompt Claude và bộ lọc LanguageTool)

Chữ trên áo thường IN HOA toàn bộ, dùng font cách điệu, câu ngắn, hay có slang. Với kết quả LanguageTool, các quy tắc này đứng trên bảng quy đổi severity.

**Lỗi ưu tiên** (prompt yêu cầu Claude soát mọi block, vì LanguageTool không thấy: từng từ vẫn đúng chính tả):
- fr-FR, es-ES: hợp giống/số giữa danh từ, mạo từ, tính từ (`MAMAN PARFAIT` → `PARFAITE`, `ABUELA ORGULLOSO` → `ORGULLOSA`).
- de-DE: đuôi tính từ và mạo từ theo giống/cách (`DER BESTER OPA` → `DER BESTE OPA`, `MEINE HUND` → `MEINEN HUND`).
- Ví dụ trong prompt cố ý **khác** với câu trong bộ test cố định, để eval đo khả năng thật chứ không phải trí nhớ ví dụ.

- **de-DE**
  - Chữ in hoa toàn bộ: bỏ qua quy tắc viết hoa danh từ. `SS` thay cho `ß` là hợp lệ.
    - Với LanguageTool, áp khi cả block in hoa toàn bộ: bỏ match thuộc category `CASING`, và bỏ match có phương án cùng `word_key` với `original` (tức chỉ khác hoa/thường hoặc `ß`/`ss`).
  - `AE`/`OE`/`UE` thay cho `Ä`/`Ö`/`Ü` (`FUER`, `MUETTER`) là cách viết hợp lệ, **không báo lỗi**, chữ hoa hay thường đều vậy. Chỉ mất hẳn umlaut (`FUR`) mới là lỗi.
    - LanguageTool: bỏ match có phương án là dạng có umlaut của `original` (`isUmlautSpelledOut()`).
    - Sau khi merge: bỏ issue (của bất kỳ nguồn nào) có phương án như vậy. Bỏ luôn lỗi chính tả **chỉ LanguageTool báo** trên từ có `AE`/`OE`/`UE`, vì LanguageTool hay báo `FUER` mà không gợi ý `FÜR` (chỉ có `FU`, `VFR`). Nếu Claude cũng báo cùng chỗ thì giữ theo Claude.
  - Vẫn phải bắt: sai đuôi từ, sai giống hoặc cách, mất umlaut (`FUR` → `FÜR`).
- **fr-FR**
  - Thiếu dấu trên chữ in hoa (`ETE` thay vì `ÉTÉ`) → `info`.
    - Cách nhận biết (LanguageTool thường báo những chỗ này là `misspelling`): `original` in hoa toàn bộ, và **bất kỳ** phương án nào trong danh sách đã xử lý (tối đa 3, gồm của cả LanguageTool lẫn Claude) chỉ khác `original` ở dấu. "Chỉ khác ở dấu" nghĩa là bỏ dấu và bỏ phân biệt hoa thường thì giống hệt. Ví dụ phương án `ETC, ÉTÉ` vẫn hạ xuống `info` nhờ `ÉTÉ`.
    - Áp lên issue **sau khi merge** và xử lý phương án sửa, trước khi tính `status`.
    - Quy tắc này **chỉ áp cho fr-FR**. Ở es-ES (`TU` → `TÚ`) và de-DE (`FUR` → `FÜR`), thiếu dấu vẫn là `error`.
  - Thiếu dấu cách trước `! ? : ;` → `info`. Với LanguageTool: match có phương án chỉ khác `original` ở khoảng trắng.
  - Vẫn phải bắt: sai hợp giống/số, sai dấu trên chữ thường.
- **es-ES**
  - Thiếu `Ñ` → `error`, không bao giờ là cố ý (`FELIZ ANO NUEVO` → `AÑO`, `CUMPLEANOS` → `CUMPLEAÑOS`).
    - LanguageTool không bắt được `ANO` vì đó là từ có thật; Claude phải bắt theo ngữ cảnh.
    - LanguageTool: match có phương án chỉ thêm dấu ngã cho `n` (`isMissingEnye()`) → `error`.
    - Sau khi merge: issue có phương án như vậy → `error` và `intentional_possible = false`, dù Claude đánh mức nào.
  - Thiếu `¿ ¡` → `warning`. Với LanguageTool: match có phương án thêm `¿`/`¡`. (Thử thực tế: LanguageTool thường không bắt lỗi này, chủ yếu dựa vào Claude.)
  - Thiếu dấu làm đổi nghĩa (`TU/TÚ`, `SI/SÍ`, `EL/ÉL`, `MAS/MÁS`) → `error`. Với LanguageTool: `original` là một trong 4 từ này và có phương án chỉ khác ở dấu. Các từ thiếu dấu khác vẫn theo bảng quy đổi (LanguageTool thường báo `misspelling` → `error`).
- **en-US: không kiểm** (`UNCHECKED_LANGUAGES` trong `lib/languages.ts`).
  - Claude vẫn nhận diện tiếng Anh (schema giữ giá trị `en-US`), chép lại chữ nhưng được dặn **không báo lỗi**. Lỗi Claude lỡ báo trên block tiếng Anh bị bỏ. LanguageTool không kiểm block này, và block không lấy ngôn ngữ chung của ảnh làm dự phòng.
  - Ảnh có block tiếng Anh không rỗng (`uncheckedBlocks` trong kết quả) tối thiểu là `warning`, kể cả khi chỉ có chữ tiếng Anh. Dưới block hiện "Chữ tiếng Anh: tool không kiểm, cần xem tay." Có lỗi de/fr/es ở block khác thì ảnh vẫn là `error`.
  - Không nhắc lỗi tiếng Anh trong ghi chú chung (`notes_vi`): prompt dặn Claude không nói tới lỗi hay cách sửa tiếng Anh, và ảnh **chỉ có** chữ tiếng Anh thì code bỏ hẳn ghi chú. Ảnh trộn tiếng Anh với de/fr/es vẫn giữ ghi chú (về phần được kiểm).
  - Từ điển không có ngôn ngữ `en-US`; dòng CSV `en-US` bị báo là dòng lỗi khi nhập.
- Slogan ngắn thường không có dấu phẩy hay dấu chấm cuối câu: prompt dặn Claude không báo thiếu dấu phẩy/chấm/chấm than (quy tắc `¿ ¡` của es-ES vẫn áp). Với LanguageTool: bỏ match thiếu dấu phẩy, gồm match có phương án chỉ thêm dấu phẩy, và match thuộc quy tắc dấu phẩy không có phương án (`KOMMA…`, `VIRG…`; `isMissingCommaMatch()`). Kiểm bản chữ thường thì LanguageTool báo loại này rất nhiều.
- Thuật ngữ Native American, tên bộ tộc, tên thương hiệu, tên riêng: không bao giờ báo lỗi nếu có trong từ điển.

## Giao diện

Áp dụng cho **mọi trang** (hiện có và sau này).

- **Phong cách:** tối giản hiện đại, lấy tinh thần Vercel/ChatGPT. Không chép logo, màu thương hiệu hay bố cục y hệt.
- **Font:**
  - Chữ giao diện: Inter (`next/font/google`), subsets `latin`, `latin-ext`, `vietnamese`.
  - Tên file và chữ trích từ mockup: JetBrains Mono (`font-mono`), subsets `latin`, `latin-ext` (đủ É ü ñ ß ¿ ¡), thêm `vietnamese` vì tên file có thể là tiếng Việt.
- **Icon:** `lucide-react`. **Component:** shadcn/ui. **Toast:** sonner (`toast` từ `sonner`, `<Toaster>` gắn ở root layout). **Phóng to ảnh:** Dialog.
- **Màu:**
  - Thang xám zinc (biến CSS trong `app/globals.css`), viền mảnh, hầu như không đổ bóng.
  - Trạng thái dùng badge/chấm nhạt (`components/status-badge.tsx`): đỏ = Lỗi, vàng = Nghi ngờ, xanh = Không lỗi, xám = còn lại.
  - Sáng/tối theo hệ thống (`next-themes`, class `dark` trên `<html>`). Nút trên header đổi vòng: theo hệ thống → sáng → tối.
- **Bố cục:**
  - Header mỏng (cao 48px, sticky): tên tool, link Kiểm tra / Từ điển / Chi phí (trang đang mở được tô nền), badge LanguageTool, nút đổi theme (icon và tooltip ghi trạng thái hiện tại: Theo hệ thống / Sáng / Tối), đăng xuất.
  - Nội dung căn giữa `max-w-5xl`.
  - Chưa có ảnh: vùng kéo thả lớn `rounded-2xl` ở giữa màn hình với câu hướng dẫn ngắn. Đã có ảnh: vùng kéo thả thu gọn thành một thanh.
  - Thẻ mockup `rounded-xl`, khoảng trắng rộng.
  - Banner dùng `components/notice.tsx` (một dòng, có icon, tông info/warning/error).
- **Chi tiết:**
  - Gạch chân lượn sóng dưới chữ sai: đỏ = lỗi, vàng = nghi ngờ (ghi chú: chấm xám).
  - Phương án sửa dạng chip; chip đầu tiên (phương án sẽ áp vào "Chữ sau khi sửa") tô xanh.
  - Skeleton cho ảnh đang xử lý, kèm số ảnh đang chờ.
  - Chuyển động 150–200ms.
  - Số đếm dùng `tabular-nums`.
  - Focus ring rõ ràng: component shadcn có sẵn; phần tử tự làm (ảnh thu nhỏ, `<summary>`, link) dùng class `focus-ring`.
  - Trang `/login` gọn, căn giữa.
- Ảnh thu nhỏ đặt trên nền ô bàn cờ xám (`bg-checkerboard`) để thiết kế nền trong suốt vẫn nhìn thấy được.

## Stack và quy ước code

- Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui
- `better-sqlite3` + Drizzle cho SQLite
- `@anthropic-ai/sdk`. Model lấy từ env `CLAUDE_MODEL`, không hardcode.
  - Dùng **structured outputs** (`output_config.format`, schema sinh từ zod bằng `zodOutputFormat`), không dùng tool use. Lý do: Sonnet 5.5 / Opus 5.5 từ chối `tool_choice` ép buộc (`any`/`tool`), còn structured outputs bảo đảm JSON đúng schema. Trường không bắt buộc khai báo là `nullable` (vẫn required) cho chắc chắn được hỗ trợ.
  - Thinking để mặc định (adaptive), chỉnh độ sâu bằng `output_config.effort` lấy từ `CLAUDE_ANALYZE_EFFORT` (mặc định `low`). Token thinking tính vào `max_tokens`.
  - Model có hỗ trợ thì bật refusal fallback phía server (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Haiku 5.5 không hỗ trợ nên không gửi.
  - Code gọi Claude đi qua interface `ClaudeTransport` (`lib/claude/transport.ts`). Bản thật (`live-transport.ts`) và bản mock (`mock-transport.ts`) dùng chung logic retry, validate và giới hạn đồng thời (`lib/claude/analyze.ts`).
  - Cache system prompt và từ điển bằng prompt caching. Mỗi model có ngưỡng độ dài tối thiểu để cache; kiểm tra `cache_read_input_tokens` thực tế. Prompt chưa đủ dài thì chấp nhận không cache; từ điển lớn dần thì cache sẽ tự có tác dụng.
- zod validate mọi input API và mọi output của Claude. Không dùng `any`.
- Unit test bằng Vitest (`npm test`), file `*.test.ts` đặt cạnh code. Test cần DB thì dùng SQLite in-memory dựng từ migration thật.
- `npm run eval [-- --dir <thư mục>]`: chạy mọi ảnh trong `test-images/expected.csv` qua đúng pipeline của `/api/analyze` (hàm dùng chung `analyzeMockup()` trong `lib/analysis/analyze-mockup.ts`).
  - Ảnh được thu nhỏ giống trình duyệt bằng `sharp` (devDependency).
  - In tỉ lệ bắt đúng và báo nhầm (tính "Lỗi + Nghi ngờ", và chỉ "Lỗi"), cùng tỉ lệ "Chữ sau khi sửa" khớp đáp án, **tổng và tách theo từng ngôn ngữ**, kèm thời gian và token trung bình mỗi ảnh. `--verbose` in thêm chữ đọc được và các lỗi. Lưu kết quả vào `<thư mục>/eval-results/<thời điểm>.json`.
  - **Tiêu chí đạt** (in cuối mỗi lần chạy, ĐẠT/TRƯỢT theo từng ngôn ngữ, kèm danh sách ca trượt; `evaluateCriteria()` trong `lib/eval/metrics.ts`):
    - 0 ảnh đúng bị xếp Lỗi; Nghi ngờ trên ảnh đúng ≤ 2 mỗi ngôn ngữ.
    - de/fr/es: 100% lỗi cố ý nằm ở Lỗi hoặc Nghi ngờ; các ca đánh dấu `must_error` (ANO, FUR, sai giống/số/cách) phải ở Lỗi.
    - "Chữ sau khi sửa" đúng ở mọi ca (không có chữ hỏng như `FU IMMER`, `THE BEST THE BEST`).
    - Trung bình < 15 s/ảnh.
    - Ảnh chữ tiếng Anh (không kiểm) phải ở Nghi ngờ.
    - Bộ tổng hợp chỉ kiểm logic. **Bộ mockup thật (`test-images/`) phải ĐẠT trước Giai đoạn 6.**
  - `expected.csv`: cột `file,expected_text,has_error[,language][,must_error][,source]`, mẫu ở `docs/expected.example.csv`. Cột `source` ghi nguồn đáp án: `claude-draft` là đáp án Claude Code tự soạn bằng cách đọc ảnh, chưa xác nhận. Còn dòng `claude-draft` thì eval in cảnh báo ở đầu và sau kết luận (kết luận chỉ là tạm thời); thay bằng chữ gốc từ file thiết kế (ví dụ `source = design-file`). Có API key thì gọi Claude thật và ghi vào `usage_daily`; không có key (dev) thì chạy mock.
  - **Bộ test cố định:** `npm run test-images` tạo 29 mockup áo thun tổng hợp (de/fr/es, có lỗi và không lỗi, gồm chữ viết tay mờ, chữ in mòn, chữ nghiêng, font máy chữ, PNG nền trong suốt, tag cổ áo tiếng Anh phải bỏ qua, áo trơn; cộng 1 ảnh tiếng Anh phải vào Nghi ngờ) cùng `expected.csv` vào `test-images/synthetic/`, vẽ bằng font Windows nên lần nào cũng giống hệt; ảnh không commit, danh sách ca nằm trong `scripts/generate-test-mockups.ts`. Chạy: `npm run eval -- --dir test-images/synthetic`. Mockup thật đặt ở `test-images/` vẫn cần, vì chữ vẽ từ font dễ đọc hơn ảnh in thật.
- Trước khi viết code dùng Anthropic SDK hoặc Drizzle, **tra docs hiện hành**.
- Ngôn ngữ:
  - Text hiển thị cho người dùng viết bằng tiếng Việt.
  - Tên biến, code và commit viết bằng tiếng Anh.
- Commit nhỏ.
- Không log nội dung ảnh, chữ đọc được hay secret. Chỉ log số lượng và lỗi kỹ thuật. Lỗi do code mình tạo (`LanguageToolError`, `ClaudeTransportError`) được ghi message; lỗi khác chỉ ghi tên loại lỗi, vì message của chúng có thể trích nội dung phản hồi.

## Biến môi trường (`.env.local` trên máy server)

```
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-sonnet-5-5
CLAUDE_MAX_CONCURRENCY=8
CLAUDE_ANALYZE_EFFORT=low
CLAUDE_MOCK=
LT_URL=http://127.0.0.1:8081
APP_USERNAME=
APP_PASSWORD_HASH_B64=
SESSION_SECRET=
SESSION_VERSION=1
DATABASE_PATH=./data/app.db
```

- `CLAUDE_ANALYZE_EFFORT`: `low` | `medium` | `high`, mặc định `low`. Không đặt tên là `CLAUDE_EFFORT` vì Claude Code tự đặt biến đó (ví dụ `xhigh`) cho mọi tiến trình nó chạy, và biến môi trường có sẵn được ưu tiên hơn `.env.local`.
- `CLAUDE_MOCK`: chỉ dùng ở dev, xem mục dưới.

## Chế độ mock (chỉ ở dev)

Dùng khi chưa có API key hoặc không muốn tốn tiền lúc phát triển giao diện.

- Bật khi `CLAUDE_MOCK=1`, hoặc tự bật khi thiếu `ANTHROPIC_API_KEY` ở môi trường không phải production. **Production không bao giờ chạy mock:** xem "Khi có sự cố".
- `/api/analyze` trả kết quả từ `fixtures/claude/*.json` thay vì gọi Claude. LanguageTool vẫn gọi thật.
- Chọn fixture theo tên file ảnh: file chứa một từ khóa trong `match` của fixture (không phân biệt hoa thường, từ khóa dài nhất thắng; ví dụ `shirt-SLANG_02.jpg` → `slang`; `english` cho mẫu chữ tiếng Anh không kiểm). Không khớp thì chọn giả ngẫu nhiên theo hash tên file, chỉ trong các fixture `pick_randomly: true`. Cùng một file luôn ra cùng một fixture, để "Thử lại" cho kết quả ổn định.
- Mỗi fixture có một chuỗi `responses`: lần gọi thứ N lấy phản hồi thứ N (hết thì lặp phản hồi cuối). Nhờ vậy mock đi qua đúng code retry thật, ví dụ `truncated` bị cắt lần đầu rồi thành công khi retry, còn `invalid-schema` sai schema cả 2 lần nên `failed`.
- Có độ trễ giả 0,4–1,5s mỗi lần gọi, để hàng đợi và thanh tiến độ chạy giống thật.

## Môi trường dev

Máy dev và máy server đều cần Node.js 24 LTS trở lên, Git và Java 21 (LanguageTool chạy được với Java 17 trở lên).

- **npm phải từ 11.19 trở lên** (có sẵn từ Node 24.20). `package.json` có `allowScripts` chặn script cài đặt của `esbuild`, `better-sqlite3`, `unrs-resolver`, vì cả ba đều có sẵn binary dựng sẵn. npm cũ không hiểu `allowScripts`, nên sẽ chạy `node-gyp rebuild` ngầm của `better-sqlite3`, và `npm ci` thất bại trên máy không có Python và Visual Studio Build Tools.
- Máy dev chạy LanguageTool bằng `scripts/start-languagetool.bat`. Máy server chạy LanguageTool như một Windows service.
