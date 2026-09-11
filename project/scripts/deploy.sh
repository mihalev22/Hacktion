#!/usr/bin/env bash
# One-shot деплой X<аксион> ТехЗадание на чистый Ubuntu/Debian VPS.
# Запускать НА СЕРВЕРЕ: sudo bash deploy.sh
# Предварительно на сервере должны быть: git, docker, docker compose плагин (скрипт ставит при отсутствии).
#
# ПОВТОРНЫЙ ЗАПУСК безопасен (git pull + перезапуск).
set -euo pipefail

REPO_URL="${REPO_URL:-}"            # https://github.com/<org>/<repo>.git
APP_DIR="${APP_DIR:-/opt/requirex}" # каталог с клоном репозитория
PORT="${PORT:-8080}"
DOMAIN="${DOMAIN:-}"                # опционально: домен для HTTPS (caddy)

if [[ $EUID -ne 0 ]]; then echo "Запусти через sudo"; exit 1; fi

PROJECT="$APP_DIR/project"

if [[ -d "$APP_DIR/.git" ]]; then
  echo "==> git pull"
  git -C "$APP_DIR" pull --ff-only
elif [[ -n "$REPO_URL" ]]; then
  echo "==> git clone"
  install -d "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
[[ -d "$PROJECT" ]] || { echo "Нет $PROJECT: запусти локально scripts/deploy_push.ps1 <IP> либо клонируй репо в $APP_DIR"; exit 1; }

# --- docker при необходимости ---
if ! command -v docker >/dev/null 2>&1; then
  echo "==> установка docker"
  apt-get update
  apt-get install -y docker.io docker-compose-v2 || {
    curl -fsSL https://get.docker.com | sh
  }
fi
systemctl enable --now docker
docker compose version

# --- .env (один раз; значения вводит человек) ---
if [[ ! -f "$PROJECT/.env" ]]; then
  cp "$PROJECT/.env.example" "$PROJECT/.env"
  chmod 600 "$PROJECT/.env"
  cat <<EOM
!!! Отредактируй $PROJECT/.env и впиши:
      S2T_API_KEY, GIGACHAT_CLIENT_ID, GIGACHAT_CLIENT_SECRET,
      JWT_SECRET=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')
      ADMIN_EMAIL=<ВАШ реальный email — он станет админом>
      SHOW_DEMO_HINT=false          # на публичном сервере обязательно false
  Затем запусти скрипт повторно:  sudo bash deploy.sh
EOM
  echo "==> .env создан, выходишь для заполнения. (или: nano $PROJECT/.env && re-run)"
  exit 0
fi

# --- секреты не должны быть в git ---
if git -C "$APP_DIR" ls-files --error-unmatch project/.env >/dev/null 2>&1; then
  echo "!! project/.env в git — убери из индекса: git rm --cached project/.env"; exit 1
fi
if grep -q "change-me-in-production" "$PROJECT/.env"; then
  echo "!! JWT_SECRET оставлен дефолтным — сгенерируй реальный в $PROJECT/.env"; exit 1
fi

# --- файрвол ---
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow "$PORT/tcp" >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
fi

echo "==> docker compose up --build"
cd "$PROJECT"
docker compose up -d --build

# --- опционально HTTPS через caddy ---
if [[ -n "$DOMAIN" ]]; then
  if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update && apt-get install -y caddy
  fi
  cat >/etc/caddy/Caddyfile <<EOC
$DOMAIN {
    reverse_proxy localhost:$PORT
}
EOC
  systemctl restart caddy
  # включаем secure-cookie для HTTPS
  sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' "$PROJECT/.env"
  docker compose up -d backend
  echo "==> HTTPS готов: https://$DOMAIN"
fi

sleep 2
echo "==> self-check"
curl -fsS "http://localhost:$PORT/api/health" && echo
curl -fsS "http://localhost:$PORT/api/config" && echo
echo "==> ГОТОВО. Открой http://<IP-сервера>:$PORT или https://$DOMAIN"
echo "    Первый аккаунт с ADMIN_EMAIL станет админом. Дальше: регистрация → загрузка mp3 → ТЗ."
