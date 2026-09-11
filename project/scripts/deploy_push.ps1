# Доставка кода на сервер и запуск деплоя.
# Использование:  powershell -File scripts\deploy_push.ps1 <IP-сервера> [ssh-пользователь]
# Требуется: встроенные Windows scp/ssh (OpenSSH клиент). На сервере нужен git ИЛИ скрипт зальёт код сам.
param(
  [Parameter(Mandatory=$true)][string]$Server,
  [string]$User = "root"
)
$ErrorActionPreference = "Stop"
$proj = Join-Path $PSScriptRoot "..\project"
$tmp = Join-Path $env:TEMP "requirex_deploy.tar.gz"

Write-Host "==> упаковка кода (без .env, БД, записей, node_modules, .venv)"
Push-Location $proj
tar.exe czf $tmp --exclude=".venv" --exclude="node_modules" --exclude="dist" --exclude="__pycache__" `
    --exclude="*.db" --exclude="uploads" --exclude="logs" --exclude=".env" --exclude="figma_token.txt" `
    --exclude="pitch" .
Pop-Location
"  размер: $([math]::Round((Get-Item $tmp).Length/1MB,1)) МБ"

Write-Host "==> доставка на $Server"
scp $tmp "${User}@${Server}:/tmp/requirex_deploy.tar.gz"
ssh "${User}@${Server}" "mkdir -p /opt/requirex/project && tar xzf /tmp/requirex_deploy.tar.gz -C /opt/requirex/project && chmod +x /opt/requirex/project/scripts/deploy.sh && echo EXTRACTED"

Write-Host "==> первичный запуск деплоя на сервере (создаст .env и остановится для ввода ключей)"
ssh "${User}@${Server}" "cd /opt/requirex && bash project/scripts/deploy.sh"
Write-Host @"
Дальше вручную ОДНАЖДЫ:
  1) ssh ${User}@${Server}
  2) nano /opt/requirex/project/.env
       S2T_API_KEY / GIGACHAT_*   — значения из локального backend\.env
       JWT_SECRET                 — python -c "import secrets;print(secrets.token_urlsafe(48))"
       ADMIN_EMAIL                — ваш email (он станет единственным админом)
       SHOW_DEMO_HINT=false       — скрыть демо-пароль на экране входа
  3) cd /opt/requirex && bash project/scripts/deploy.sh   (повторный запуск достроит и поднимет)
Открыть: http://${Server}:8080
"@
