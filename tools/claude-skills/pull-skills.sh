#!/usr/bin/env bash
# Đồng bộ skills từ kho CLAUDE_SKILLS_REPO vào ~/.claude/skills mỗi SessionStart.
#
# Vì sao có 2 đường tải:
#   • git clone chỉ chạy được khi git smart-HTTP relay/proxy cho phép. Trên
#     Claude Code on the web, relay bị giới hạn vào ĐÚNG repo của session
#     (vd: mrhuychien/salep) nên clone kho skills khác trả về HTTP 403.
#   • Nhưng archive tarball công khai của github.com VẪN được egress policy cho
#     phép. Nên khi clone fail, ta fallback sang tải tarball qua HTTPS.
set -uo pipefail
REPO="${CLAUDE_SKILLS_REPO:-}"; [ -z "$REPO" ] && exit 0
BRANCH="${CLAUDE_SKILLS_BRANCH:-main}"
DEST="$HOME/.claude/skills"; mkdir -p "$DEST"
PROJ="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/skills"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

fetched=""

# 1) Thử git clone — tốt cho máy local / kho nằm trong phạm vi git của session.
if git clone --depth 1 --branch "$BRANCH" "$REPO" "$tmp/repo" 2>/dev/null \
   || git clone --depth 1 "$REPO" "$tmp/repo" 2>/dev/null; then
  fetched="$tmp/repo"
else
  # 2) Fallback: tải tarball công khai qua HTTPS (đường github.com/.../archive
  #    không bị git relay chặn). Chỉ áp dụng cho repo công khai trên github.com.
  case "$REPO" in
    https://github.com/*)
      slug="${REPO#https://github.com/}"; slug="${slug%.git}"; slug="${slug%/}"
      url="https://github.com/${slug}/archive/refs/heads/${BRANCH}.tar.gz"
      if curl -fsSL "$url" -o "$tmp/repo.tgz" 2>/dev/null \
         && tar xzf "$tmp/repo.tgz" -C "$tmp" 2>/dev/null; then
        # Thư mục gốc vừa giải nén (vd: claude-skills-main/)
        fetched="$(find "$tmp" -maxdepth 1 -mindepth 1 -type d | head -1)"
      fi
      ;;
  esac
fi

if [ -z "$fetched" ] || [ ! -d "$fetched" ]; then
  echo "[skills] không pull được kho ($REPO) → bỏ qua, session vẫn chạy"; exit 0
fi

src="$fetched/skills"; [ -d "$src" ] || src="$fetched"
n=0
for d in "$src"/*/; do
  [ -f "${d}SKILL.md" ] || continue
  name="$(basename "$d")"
  [ -d "$PROJ/$name" ] && continue          # project skill cùng tên THẮNG (chống trùng)
  rm -rf "$DEST/$name"; cp -a "$d" "$DEST/$name"; n=$((n+1))
done
echo "[skills] đã đồng bộ $n skill vào $DEST"
