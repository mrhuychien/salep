# Claude skills setup — debug & fix

Cơ chế nạp skills cá nhân từ kho `CLAUDE_SKILLS_REPO` vào mọi session Claude Code
on the web, kèm bản vá cho lỗi không pull được skills.

## Triệu chứng

Khi mở session, SessionStart hook in ra:

```
[skills] không pull được kho (https://github.com/mrhuychien/claude-skills.git) → bỏ qua, session vẫn chạy
```

`~/.claude/skills` trống (chỉ còn skill cài sẵn), không skill nào của bạn được nạp.

## Nguyên nhân gốc

Hook cũ pull bằng `git clone`. Trên Claude Code on the web, mọi traffic git đi qua
**git smart-HTTP relay của agent proxy**, và relay này bị **giới hạn đúng vào repo
của session** (ở đây là `mrhuychien/salep`). Clone một repo khác → proxy trả về:

```
fatal: unable to access '.../git/mrhuychien/claude-skills.git/': The requested URL returned error: 403
```

Kiểm chứng:

| Đường truy cập | Kết quả |
| --- | --- |
| `git clone` kho skills (qua git relay) | **403** (bị chặn — ngoài phạm vi session) |
| Trang web `github.com/.../claude-skills` | 200 |
| API `api.github.com/repos/.../claude-skills` | 200 (repo **public**) |
| Tarball `github.com/.../archive/refs/heads/main.tar.gz` | **200** (được phép) |

→ Không phải kho hỏng hay sai URL. Chỉ riêng **git relay** chặn repo ngoài phạm vi;
HTTPS archive vẫn qua được egress policy.

## Bản vá

`pull-skills.sh` được sửa để:

1. Thử `git clone` trước (chạy tốt ở máy local / khi repo nằm trong phạm vi git).
2. Nếu clone fail → **fallback tải tarball công khai** qua
   `https://github.com/<owner>/<repo>/archive/refs/heads/<branch>.tar.gz`,
   giải nén rồi đồng bộ như cũ.

Logic đồng bộ giữ nguyên: chỉ copy thư mục có `SKILL.md`, và **skill cùng tên ở
`.claude/skills` của project sẽ thắng** (chống trùng).

Sau bản vá, hook nạp được toàn bộ 43 skills:

```
[skills] đã đồng bộ 43 skill vào /root/.claude/skills
```

## Cách áp dụng

Bản vá phải nằm trong **Setup script của environment** (không phải trong repo
`salep`), vì hook được cài ở `~/.claude` cấp environment.

1. Mở environment trong web UI → phần **Setup script**.
2. Dán toàn bộ nội dung [`environment-setup-script.sh`](./environment-setup-script.sh).
3. Đảm bảo Environment variable `CLAUDE_SKILLS_REPO` trỏ tới kho skills.
   (Tuỳ chọn `CLAUDE_SKILLS_BRANCH`, mặc định `main`.)
4. Lưu lại — session mới sẽ nạp skills qua đường tarball.

Lý tưởng nhất: cập nhật luôn `environment-setup-script.sh` trong chính kho
`claude-skills` để nguồn sự thật khớp với bản vá này.

## Yêu cầu

- Kho skills phải **public** (đường tarball cần truy cập ẩn danh).
  Nếu kho private, hãy thêm `mrhuychien/claude-skills` vào phạm vi GitHub của
  environment để `git clone` hoạt động trở lại.

## Tệp trong thư mục này

| Tệp | Vai trò |
| --- | --- |
| `environment-setup-script.sh` | Dán vào Setup script của environment (đã gồm hook đã vá). |
| `pull-skills.sh` | Bản standalone của hook (tham khảo / dùng ở máy local). |
| `README.md` | Tài liệu này. |
