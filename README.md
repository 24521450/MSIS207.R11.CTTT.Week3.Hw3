# KRAFTON × PUBG Vietnam Championship & Airdrop Arena

Demo học tập bằng React 19, TypeScript strict và Vite. Giao diện tiếng Việt minh họa bảng xếp hạng PUBG Việt Nam, kill-feed có windowing và các đợt airdrop với mock service chạy hoàn toàn trong trình duyệt.

> Đây không phải website chính thức của KRAFTON hay PUBG. Giá và tồn kho chỉ dùng để minh họa; demo không thu tiền, không có backend/KRAFTON API và không đồng bộ tồn kho giữa các trình duyệt.

## Chạy ứng dụng

Yêu cầu Node.js 24 và npm.

```bash
npm ci
npm run dev
```

Vite chạy ở địa chỉ hiển thị trong terminal. Ứng dụng production được build vào `dist/`.

## Kiến trúc

- `src/domain/contracts.ts`: contract readonly cho phase, airdrop, đội tuyển, kill-feed và kết quả claim.
- `src/domain/airdrop.ts`: phase, formatter VND và các đợt demo.
- `src/domain/mockAirdropService.ts`: kho mô phỏng, latency, idempotency và ba kịch bản xác định.
- `src/hooks/usePubgAirdropTimer.ts`: countdown từ deadline epoch, đồng bộ khi đổi input và khi tab hiện lại.
- `src/hooks/useAirdropSession.ts`: optimistic claim, khóa request đồng bộ theo đợt, rollback và cô lập response qua reset/unmount.
- `src/data/seedData.ts`: bốn đội và 10.000 sự kiện có seed xác định.
- `src/components/VirtualKillFeed.tsx`: lọc sự kiện và chỉ render cửa sổ viewport cộng overscan.
- `src/components/Leaderboard.tsx`: lọc, sắp xếp ổn định và cập nhật điểm mô phỏng có thể tạm dừng.

## Contract thời gian và phase

`DropPhase = 'WARMUP' | 'AIRDROP_LIVE' | 'LOOTED_OUT' | 'EXPIRED'`.

Timer tính `Math.max(0, targetEpochMs - (Date.now() + serverOffsetMs))` ở mỗi lần đồng bộ; nó không trừ dần từ giá trị trước. Hook chạy mỗi 200 ms, đồng bộ ngay khi mount/đổi target, và đồng bộ ngay khi `visibilitychange` về `visible`. `isLive` chỉ cho biết countdown đã chạm deadline. Claim vẫn được kiểm tra độc lập ở hook và service.

Phase dùng chung cho UI/service theo thứ tự: đến `expiresAtEpochMs` là `EXPIRED`; trước `dropEpochMs` là `WARMUP`; trong cửa sổ mở mà stock bằng 0 là `LOOTED_OUT`; còn lại là `AIRDROP_LIVE`. Thời điểm claim và service dùng cùng offset đồng hồ. Mỗi lần reset tạo lại một đợt sắp mở sau khoảng 15 giây, một đợt đang mở còn hàng và một đợt hết hàng.

Giá tiền hiển thị bằng `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`.

## Optimistic claim và các kịch bản

Stock chuẩn nằm trong service, tách khỏi con số optimistic đang hiển thị. Trước `await`, hook khóa thao tác theo drop bằng `Map` trong `ref` và trừ optimistic tối đa một đơn vị. Mỗi thao tác có `claimId`; service giữ kết quả theo cặp drop/claim để cùng một ID không trừ kho lần hai.

Khu vực **Kịch bản service** chọn một trong ba kết quả xác định:

1. **Nhận thành công**: service kiểm tra phase/stock rồi trừ một đơn vị; UI nhận snapshot đã xác nhận.
2. **Đối thủ nhận hết (409)**: service mô phỏng đối thủ lấy hết kho và trả snapshot stock bằng 0. UI bỏ optimistic state và dùng snapshot đó, không tự cộng lại một đơn vị.
3. **Lỗi tạm thời**: service không đổi stock; optimistic state được hoàn tác và người dùng có thể thử lại với `claimId` mới.

Mã 409 là mô phỏng tại ranh giới service trong trình duyệt, không phải HTTP backend thật. Latency cố định 650 ms giúp demo dễ lặp lại. Reset tạo phiên mới; response của phiên cũ không được ghi vào giao diện phiên mới. Có thể dùng **RESET DEMO** để đưa dữ liệu về trạng thái ban đầu.

## Kiểm tra

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:browser
```

Suite Vitest dùng fake timers để kiểm tra deadline, clock jump, offset, visibility resync, đổi target, cleanup, phase/claim tại ranh giới, idempotency, double-click, reconcile/rollback, retry, reset/unmount, sort/filter và virtual list ở đầu/giữa/cuối. Browser script mở production preview, chụp desktop/mobile vào `evidence/`, chạy các kịch bản claim, kiểm tra scroll/filter/sort và ghi lỗi console vào `evidence/production-preview-browser.json`.

Để chạy lại browser suite trên bản Pages đã deploy:

```bash
npm run verify:browser -- https://24521450.github.io/MSIS207.R11.CTTT.Week3.Hw3/
```

Lần kiểm tra deploy được lưu riêng trong `evidence/deployed-site-browser.json` cùng ảnh desktop/mobile.

GitHub Actions chạy `npm ci`, typecheck, lint, test, build rồi deploy artifact `dist/` lên GitHub Pages khi push `main`.

## Giới hạn demo và liên kết

- Mỗi tab có kho local độc lập; nhiều người dùng/trình duyệt không chia sẻ tồn kho.
- Điểm leaderboard, feed trực tiếp, latency, lỗi tạm thời và 409 đều được mô phỏng cục bộ.
- Không có giao dịch thật, tài khoản, xác thực, backend, thanh toán hoặc API của KRAFTON/PUBG.
- Link GitHub Pages đã deploy và kiểm tra production: <https://24521450.github.io/MSIS207.R11.CTTT.Week3.Hw3/>.

Nhật ký audit lỗi AI trong quá trình làm/review nằm tại [`AI_FAILURE_AUDIT.md`](./AI_FAILURE_AUDIT.md).
