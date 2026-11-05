# Chùa Online · TikTok LIVE for Mac M4

Hệ thống livestream TikTok tương tác 9:16, chạy cục bộ trên Mac Apple Silicon. Bun.js chạy web; ZeroTTS đọc lời cầu nguyện; OBS phát hình và âm thanh lên TikTok. Bảng điều khiển quản lý nhanh OBS, TikTok và tương tác.

## Một lệnh cài đặt và khởi chạy

Trên macOS Apple Silicon (M1/M2/M3/M4), mở Terminal:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/longnt27/tiktok-live-temple-rpc/main/scripts/install-mac.sh)"
```

Lệnh cài Homebrew (nếu thiếu), Bun, Python 3.11, uv, Git và OBS Studio, clone repo vào `~/projects/tiktok-live-temple-rpc`, cài dependencies, mở OBS và dashboard.

**Không dùng `curl ... | bash` cho installer này.** Trong quá trình Homebrew cài dependency, một tiến trình con có thể đọc stdin và vô tình nuốt các dòng còn lại của script. Lệnh `bash -c "$(curl ...)"` tải toàn bộ script trước khi chạy nên tránh được lỗi này. Nếu lần cài đầu dừng giữa chừng, cứ chạy lại lệnh trên: các gói Homebrew đã cài sẽ được giữ nguyên.

Có thể đổi thư mục đích nếu cần bằng biến môi trường `TEMPLE_DIR`, nhưng mặc định là `~/projects/tiktok-live-temple-rpc`. Lần đầu macOS có thể yêu cầu cài Xcode Command Line Tools; hoàn tất hộp thoại đó rồi chạy lại lệnh. Lần đầu ZeroTTS có thể tải model. Đọc script trước khi chạy nếu muốn kiểm toán lệnh cài đặt.

- Dashboard: http://127.0.0.1:3000/dashboard
- Sân khấu độc lập: http://127.0.0.1:3000/?obs=1
- Trạng thái server: http://127.0.0.1:3000/api/state

## Thiết lập OBS lần đầu

1. Mở OBS Studio. Vào **Tools → WebSocket Server Settings**, bật WebSocket server, **giữ bật Authentication** và port **4455**. Copy mật khẩu.
2. Trong dashboard, mở **OBS WebSocket password**, nhập mật khẩu và bấm **Lưu trên máy**.
3. Bấm **Tạo scene 9:16**. Phần mềm tạo scene `Chua Online | TikTok 9:16` và Browser Source `http://127.0.0.1:3000/?obs=1` ở 1080×1920, 30fps. Bấm lại không tạo trùng source.
4. Test tiếng: trong OBS, chuột phải Browser Source → **Interact** → click sân khấu để mở khóa âm thanh nếu cần; kiểm tra Audio Mixer. Dùng **Ghi thử** trên dashboard, xem lại video và nghe âm thanh.
5. Trong dashboard, nhập @username TikTok đang LIVE và chọn **Kết nối bình luận**. Nó đọc sự kiện phòng LIVE, không đăng nhập vào tài khoản.
6. Khi TikTok đã cấp quyền dùng encoder/RTMP, lấy Server URL + Stream Key từ TikTok. Điền vào mục **Điểm phát video**, bấm **Lưu vào OBS**, rồi **Phát LIVE**. TikTok có thể yêu cầu hoàn tất thêm bước LIVE phía nền tảng.

**Repo không thể tự cấp quyền TikTok LIVE và không thể tự xin Stream Key.** Chỉ nhập key nếu TikTok đã cấp. Các nút LIVE trong dashboard điều khiển OBS qua WebSocket, không vượt qua điều kiện LIVE của TikTok.

## Sử dụng nhanh

Dashboard hỗ trợ kết nối/ngắt TikTok, mở OBS, tạo scene, ghi thử/dừng ghi, phát/dừng livestream, bật tắt giả lập, thử thắp hương, cầu nguyện, xin xăm, gõ mõ và phát thử ZeroTTS.

**Giả lập** dành cho thử nghiệm. Tắt khi LIVE thật để không hiển thị tương tác giả.

### Chạy lần sau

```bash
cd ~/projects/tiktok-live-temple-rpc
bun start
```

Mở lại http://127.0.0.1:3000/dashboard. Server chạy khi Terminal mở; nhấn Ctrl+C để dừng. Mật khẩu OBS cất trong `data/obs-config.json` (file local chỉ user đọc). Stream Key được OBS quản lý, không ghi vào mã nguồn và không trả về dashboard.

### Cài thủ công nếu đã clone repo

```bash
brew install bun python@3.11 uv
brew install --cask obs
bun install --frozen-lockfile
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python zerotts pillow
bun start
```

## Lỗi thường gặp

| Vấn đề | Hướng xử lý |
| --- | --- |
| OBS chưa kết nối | Mở OBS, bật Tools → WebSocket Server Settings, kiểm tra port 4455 và password |
| Đã kết nối nhưng không có scene | Bấm Tạo scene 9:16; nếu OBS đang record/stream, dừng trước khi đổi resolution |
| Stream không có tiếng | OBS Browser Source → Interact → click; kiểm tra audio mixer và record thử |
| TikTok không có sự kiện | Phòng phải đang LIVE công khai; connector không chính thức nên có thể lỗi khi TikTok đổi giao thức |
| Start Stream báo lỗi | Kiểm tra quyền RTMP của tài khoản, Server URL và Stream Key |
| TTS không chạy | Xem Terminal, Python venv và model tải về lần đầu |
| Cổng 3000 bị chiếm | Dừng server cũ đang chạy |

## An toàn và giới hạn

- Server bind vào 127.0.0.1, OBS WebSocket ở 127.0.0.1:4455. **Không mở port, port forwarding hay tunnel ra Internet.** Dashboard này được thiết kế để quản lý trên chính Mac của mày.
- Mật khẩu WebSocket OBS không được tắt để đổi lấy sự tiện lợi. Giữ Stream Key bí mật.
- OBS Browser Source và dashboard là hai trình duyệt độc lập. Âm thanh preview không thay thế kiểm tra âm thanh đầu ra OBS.
- Nhạc nền `public/assets/bg_chant.m4a` không có trong repo upstream, có thể cung cấp file nhạc được phép sử dụng; nếu thiếu sẽ dùng tiếng tổng hợp dự phòng.
- Phần đọc TikTok sử dụng `tiktok-live-connector` không chính thức, không có bảo đảm uptime.
- OBS hiện đại tích hợp obs-websocket 5, không cần cài plugin bổ sung.
- Kiểm tra quyền nội dung hình ảnh và nhạc nền khi phát công khai.

## Credit

Fork từ [zane-tv/tiktok-live-temple-rpc](https://github.com/zane-tv/tiktok-live-temple-rpc), giữ lại assets và logic nghi thức của upstream.
