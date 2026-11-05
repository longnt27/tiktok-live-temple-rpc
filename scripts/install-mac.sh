#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/longnt27/tiktok-live-temple-rpc.git"
APP_DIR="${TEMPLE_DIR:-$HOME/projects/tiktok-live-temple-rpc}"
BREW="/opt/homebrew/bin/brew"

log(){ printf '\n\033[1;35m[Chua Online]\033[0m %s\n' "$*"; }
fail(){ printf '\n[Chua Online] LOI: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || fail "Installer chi ho tro macOS."
[[ "$(uname -m)" == "arm64" ]] || fail "Installer danh cho Mac Apple Silicon."
if ! xcode-select -p >/dev/null 2>&1; then
  log "Thieu Xcode Command Line Tools. macOS se mo hop thoai cai dat. Sau khi cai, chay lai lenh nay."
  xcode-select --install || true
  exit 1
fi

if [[ ! -x "$BREW" ]] && ! command -v brew >/dev/null 2>&1; then
  log "Cai Homebrew (co the yeu cau mat khau macOS)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
if [[ -x "$BREW" ]]; then
  eval "$("$BREW" shellenv)"
fi
command -v brew >/dev/null || fail "Khong tim thay Homebrew sau khi cai."

log "Kiem tra Bun, Python 3.11, uv, Git va OBS Studio..."
for formula in bun python@3.11 uv git; do
  if ! brew list --formula "$formula" >/dev/null 2>&1; then
    brew install "$formula"
  fi
done
if ! brew list --cask obs >/dev/null 2>&1 && [[ ! -d /Applications/OBS.app ]]; then
  brew install --cask obs
fi

if [[ -d "$APP_DIR/.git" ]]; then
  log "Da co project tai $APP_DIR"
  log "Khong tu dong ghi de code cu. De cap nhat, chay git pull --ff-only trong thu muc repo."
elif [[ -e "$APP_DIR" ]]; then
  fail "Thu muc $APP_DIR da ton tai nhung khong phai Git repo."
else
  log "Tai repo ve $APP_DIR"
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
log "Cai JavaScript dependencies..."
bun install --frozen-lockfile

log "Cai ZeroTTS Python 3.11 (lan dau can tai model)..."
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python zerotts pillow

log "Mo OBS va dashboard..."
open -a OBS || true
(sleep 3; open "http://127.0.0.1:3000/dashboard") >/dev/null 2>&1 &

log "Da cai dat. Giu Terminal nay mo khi dang livestream."
log "Dashboard: http://127.0.0.1:3000/dashboard"
log "OBS: Tools > WebSocket Server Settings > Enable WebSocket server (4455), copy password vao dashboard."
log "DUNG chia se Stream Key, hoac mo port 3000/4455 ra Internet."
exec bun start
