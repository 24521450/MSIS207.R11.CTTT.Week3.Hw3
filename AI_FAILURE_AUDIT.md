# AI Failure Audit

Ghi nhận các lỗi thật phát hiện trong quá trình triển khai/review và cách xác nhận bản sửa. Không tạo lỗi có chủ đích để làm đầy audit.

## 1. Latency service được lên lịch lặp thay vì một lần

- **Hành vi sai:** callback hoàn tất claim được lên lịch bằng interval. Sau lần đầu nó không còn request đang bay để xử lý, nhưng interval vẫn sống và tiếp tục đánh thức trình duyệt.
- **Cách phát hiện/tái hiện:** review vòng đời API async; gọi `claim`, chờ latency và quan sát timer còn tồn tại sau khi Promise đã settle.
- **Nguyên nhân:** dùng nhầm primitive interval cho một response một lần.
- **Vị trí sửa:** `src/domain/mockAirdropService.ts` dùng `setTimeout` qua `AirdropClock`; callback xoá request đang bay trước khi trả kết quả.
- **Regression evidence:** `src/domain/mockAirdropService.test.ts` kiểm tra idempotency và reset trong request; timer count về 0 sau khi response stale được xử lý.

## 2. Timer có thể vẽ deadline cũ một frame khi target đổi

- **Hành vi sai:** bản hook ban đầu đồng bộ input mới bằng passive effect, nên render đầu tiên sau khi target đổi vẫn có thể mang `remainingMs` của target trước.
- **Cách phát hiện/tái hiện:** review luồng đổi phase `WARMUP` → deadline đóng cửa; rerender hook với target khác và so sánh giá trị trước lần tick 200 ms tiếp theo.
- **Nguyên nhân:** đồng bộ state sau paint thay vì trong layout phase.
- **Vị trí sửa:** `src/hooks/usePubgAirdropTimer.ts` dùng `useLayoutEffect` để sync ngay khi target/offset đổi, rồi mới bắt đầu interval.
- **Regression evidence:** `src/hooks/usePubgAirdropTimer.test.tsx` kiểm tra input target đổi, offset, clock jump, visibility resync và cleanup.

## 3. Virtual list so sánh ID với object sự kiện

- **Hành vi sai:** kiểm tra thay đổi đầu feed so sánh `prior.ids[0]` (string) với `filtered[0]` (event object). Điều kiện luôn đúng, khiến tìm anchor tuyến tính chạy ở mọi lần cuộn/rerender và vi phạm kiểm tra TypeScript.
- **Cách phát hiện/tái hiện:** `npm run typecheck` báo TS2367 tại `src/components/VirtualKillFeed.tsx`; kiểm tra kiểu dữ liệu xác nhận nhánh anchor được kích hoạt cả khi ID đầu không đổi.
- **Nguyên nhân:** thiếu `.id` khi so sánh phần tử của danh sách sự kiện.
- **Vị trí sửa:** `src/components/VirtualKillFeed.tsx` so sánh `prior.ids[0]` với `filtered[0]?.id`.
- **Regression evidence:** typecheck và test đầu/giữa/cuối/filter trong `src/components/VirtualKillFeed.test.tsx`.

## 4. Optimistic stock ban đầu làm phase báo hết hàng trước khi claim được xác nhận

- **Hành vi sai:** bản render đầu của drop card tính phase bằng stock optimistic. Khi còn một vé cuối, click làm số stock tạm thành 0 và badge chuyển sang `LOOTED_OUT` dù request vẫn đang chờ service.
- **Cách phát hiện/tái hiện:** review race tại trường hợp còn một vé; claim liên tiếp đến đơn vị cuối và quan sát badge trong khoảng latency 650 ms.
- **Nguyên nhân:** dùng con số trình bày optimistic cho quyết định phase thay vì snapshot kho đã xác nhận.
- **Vị trí sửa:** `src/App.tsx` tính phase bằng `snapshots` chuẩn từ service; `displayedStock` chỉ dùng cho số lượng nhìn thấy.
- **Regression evidence:** `src/App.test.tsx` giữ phase `AIRDROP_LIVE` trong lúc claim cuối đang chờ rồi chuyển sang `LOOTED_OUT` khi service xác nhận thành công; domain boundary được kiểm tra riêng trong `src/domain/airdrop.test.ts`.

## 5. Đổi scenario xóa trạng thái claim đang chờ

- **Hành vi sai:** khi đang chờ response 650 ms, đổi scenario làm nút claim bật lại và message pending biến mất. Ref lock còn giữ request, nên click mới bị bỏ qua trong khi UI nói người dùng có thể nhận.
- **Cách phát hiện/tái hiện:** báo cáo kiểm tra HW3 ngày 02/11/2026 ghi nhận lỗi này; tái hiện bằng cách chọn lỗi tạm thời, claim vé PVS rồi đổi select trước khi hết latency.
- **Nguyên nhân:** `setScenario()` gọi `setClaims({})`, xóa cả trạng thái `pending`; service đã chụp scenario khi bắt đầu request nhưng giao diện xóa trạng thái của request đó.
- **Vị trí sửa:** `src/hooks/useAirdropSession.ts` chỉ xóa claims đã settle khi đổi scenario; claims `pending` giữ nguyên status, message và `claimId`.
- **Regression evidence:** `src/hooks/useAirdropSession.test.tsx` xác nhận request đầu trả lỗi theo scenario ban đầu và request kế tiếp dùng scenario mới; `src/App.test.tsx` xác nhận nút còn disabled và message pending còn hiển thị. Browser regression lặp luồng này với cả PVS và G-Coin.

## 6. Brand link có accessible name không khớp nội dung hiển thị

- **Hành vi sai:** accessible name của brand link bỏ qua chữ `BATTLEGROUNDS · VIETNAM · CHAMPIONSHIP`, bị axe báo `label-content-name-mismatch` trên cả desktop và mobile.
- **Cách phát hiện/tái hiện:** báo cáo kiểm tra HW3 ghi một violation cho `.brand-lockup` ở cả hai viewport.
- **Nguyên nhân:** `aria-label` khác nội dung con và thay thế tên được tính từ chữ hiển thị.
- **Vị trí sửa:** `src/App.tsx` bỏ `aria-label` dư để accessible name được lấy từ nội dung brand đang hiển thị.
- **Regression evidence:** browser script chạy axe trên production preview và site deploy ở desktop/mobile, yêu cầu mỗi viewport không có violation.
