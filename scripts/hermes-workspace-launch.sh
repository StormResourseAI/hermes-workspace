#!/usr/bin/env bash
# User-level Hermes Workspace launcher.
# Proven local mode is `pnpm dev` on 127.0.0.1:3000 (not production `pnpm start`).
# Launchd/normal-user context only — do not start this from a Cursor sandbox.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LABEL="com.stormbot.hermes-workspace"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
RUNTIME_DIR="$ROOT/.runtime"
LOG_FILE="$RUNTIME_DIR/hermes-workspace.log"
PID_FILE="$RUNTIME_DIR/hermes-workspace.pid"
HOST="127.0.0.1"
PORT="3000"
GATEWAY_URL="http://127.0.0.1:8642"
DASHBOARD_URL="http://127.0.0.1:9119"
HERMES_STORMBOT_HOME="${HERMES_HOME:-/Users/brianackley/.hermes-stormbot}"
UID_NUM="$(id -u)"

mkdir -p "$RUNTIME_DIR"

log() {
  local msg
  msg="$(date '+%Y-%m-%d %H:%M:%S') [workspace-launch] $*"
  printf '%s\n' "$msg" >>"$LOG_FILE"
  printf '%s\n' "$msg"
}

die() {
  log "ERROR: $*"
  exit 1
}

resolve_path() {
  local fnm_bin=""
  fnm_bin="$(ls -d "$HOME/.local/share/fnm/node-versions"/v22.*/installation/bin 2>/dev/null | sort -V | tail -1 || true)"
  export PATH="${fnm_bin:+$fnm_bin:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  export HOME="${HOME:-/Users/brianackley}"
  command -v pnpm >/dev/null 2>&1 || die "pnpm not found on PATH"
  command -v node >/dev/null 2>&1 || die "node not found on PATH"
}

read_env_key() {
  local file="$1"
  local key="$2"
  python3 - "$file" "$key" <<'PY'
import sys
from pathlib import Path
path, key = sys.argv[1], sys.argv[2]
p = Path(path)
if not p.exists():
    raise SystemExit(0)
for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
    raw = line.strip()
    if not raw or raw.startswith("#") or "=" not in raw:
        continue
    name, value = raw.split("=", 1)
    if name.strip() != key:
        continue
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1]
    sys.stdout.write(value)
    break
PY
}

gateway_http() {
  curl --max-time 2 -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8642/health" || true
}

load_workspace_env() {
  if [[ -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +a
  fi
  HOST="127.0.0.1"
  PORT="3000"
  export HOST PORT CI=true
  export HERMES_API_URL="$GATEWAY_URL"
  export HERMES_DASHBOARD_URL="$DASHBOARD_URL"
  export CLAUDE_API_URL="$GATEWAY_URL"
  export CLAUDE_DASHBOARD_URL="$DASHBOARD_URL"
}

load_gateway_token() {
  local token=""
  local err=""
  local errfile=""
  local recover="$ROOT/scripts/recover-gateway-api-key.py"
  local attempt
  local max_attempts="${HERMES_GATEWAY_WAIT_ATTEMPTS:-30}"
  local sleep_s="${HERMES_GATEWAY_WAIT_SECONDS:-2}"
  local health=""
  [[ -f "$recover" ]] || die "gateway API key recovery script is missing"
  errfile="$(mktemp -t hermes-gw-key.XXXXXX)"
  for attempt in $(seq 1 "$max_attempts"); do
    health="$(gateway_http)"
    if [[ "$health" == "200" ]]; then
      if token="$(python3 "$recover" --host 127.0.0.1 --port 8642 2>"$errfile")"; then
        if [[ -n "$token" ]]; then
          rm -f "$errfile"
          export HERMES_API_TOKEN="$token"
          unset token
          log "gateway token: recovered from live :8642 process"
          return 0
        fi
      fi
      token="$(read_env_key "$HERMES_STORMBOT_HOME/.env" API_SERVER_KEY || true)"
      if [[ -n "$token" ]]; then
        rm -f "$errfile"
        export HERMES_API_TOKEN="$token"
        unset token
        log "gateway token: recovered from dedicated HERMES_HOME env"
        return 0
      fi
      err="$(tr '\n' ' ' <"$errfile" 2>/dev/null || true)"
      rm -f "$errfile"
      die "${err:-gateway API key unavailable (listener healthy but API_SERVER_KEY missing)}"
    fi
    err="$(tr '\n' ' ' <"$errfile" 2>/dev/null || true)"
    if [[ "$attempt" -eq 1 || $((attempt % 5)) -eq 0 ]]; then
      log "waiting for Hermes Agent :8642 (attempt ${attempt}/${max_attempts} http=${health:-000})"
    fi
    sleep "$sleep_s"
  done
  rm -f "$errfile"
  die "${err:-gateway is not listening on 127.0.0.1:8642}"
}

workspace_http() {
  curl --max-time 5 -s -o /dev/null -w '%{http_code}' "http://${HOST}:${PORT}/" || true
}

listener_pids() {
  lsof -nP -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true
}

listener_address() {
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $9; exit}'
}

is_workspace_pid() {
  local pid="$1"
  local command=""
  local cwd=""
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ {print substr($0,2); exit}')"
  [[ "$command" == *"vite"* || "$command" == *"pnpm"* || "$command" == *"hermes-workspace"* ]] || return 1
  [[ "$cwd" == "$ROOT"* || "$command" == *"$ROOT"* || "$command" == *"hermes-workspace-stormbot-v1"* ]]
}

workspace_healthy() {
  [[ "$(workspace_http)" == "200" ]]
}

prove_hermes_writable() {
  local dir="$HOME/.hermes/webui-mvp/runs"
  local probe="$dir/.workspace-launch-probe.$$"
  mkdir -p "$dir" || die "cannot create Hermes run-state directory (EPERM or sandbox)"
  if ! printf 'ok\n' >"$probe" 2>/dev/null; then
    rm -f "$probe"
    die "cannot write Hermes run state under ~/.hermes (EPERM or sandbox)"
  fi
  rm -f "$probe"
  log "hermes run-state writes: ok"
}

stop_pid() {
  local pid="$1"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    local _i
    for _i in {1..20}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        return 0
      fi
      sleep 0.25
    done
    kill -9 "$pid" 2>/dev/null || true
  fi
}

reclaim_stale_listener() {
  local pid
  local code
  code="$(workspace_http)"
  if [[ "$code" == "200" ]]; then
    return 0
  fi
  for pid in $(listener_pids); do
    if is_workspace_pid "$pid"; then
      log "replacing stale workspace pid=$pid http=$code"
      stop_pid "$pid"
    else
      die "port ${PORT} is in use by a non-workspace process (pid=$pid)"
    fi
  done
}

launchd_loaded() {
  launchctl print "gui/${UID_NUM}/${LABEL}" >/dev/null 2>&1
}

write_plist() {
  mkdir -p "$HOME/Library/LaunchAgents" "$RUNTIME_DIR"
  resolve_path
  local path_value="$PATH"
  cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ROOT}/scripts/hermes-workspace-launch.sh</string>
    <string>--foreground</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>PATH</key>
    <string>${path_value}</string>
    <key>HOST</key>
    <string>${HOST}</string>
    <key>PORT</key>
    <string>${PORT}</string>
    <key>CI</key>
    <string>true</string>
    <key>HERMES_API_URL</key>
    <string>${GATEWAY_URL}</string>
    <key>HERMES_DASHBOARD_URL</key>
    <string>${DASHBOARD_URL}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>Crashed</key>
    <true/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
</dict>
</plist>
EOF
  log "wrote LaunchAgent $PLIST"
}

wait_for_health() {
  local i code
  for i in $(seq 1 40); do
    code="$(workspace_http)"
    if [[ "$code" == "200" ]]; then
      log "workspace healthy http=$code"
      return 0
    fi
    sleep 0.5
  done
  die "workspace did not become healthy on ${HOST}:${PORT}"
}

cmd_foreground() {
  resolve_path
  load_workspace_env
  load_gateway_token
  prove_hermes_writable
  if workspace_healthy; then
    log "refusing duplicate start; ${HOST}:${PORT} already healthy"
    exit 0
  fi
  reclaim_stale_listener
  log "starting pnpm dev on ${HOST}:${PORT}"
  exec </dev/null pnpm dev --host 127.0.0.1 --strictPort
}

cmd_install() {
  resolve_path
  write_plist
  launchctl bootout "gui/${UID_NUM}" "$PLIST" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/${UID_NUM}" "$PLIST"
  launchctl enable "gui/${UID_NUM}/${LABEL}" >/dev/null 2>&1 || true
  wait_for_health
  local pid
  pid="$(listener_pids | awk 'NR==1{print; exit}')"
  if [[ -n "$pid" ]]; then
    printf '%s\n' "$pid" >"$PID_FILE"
  fi
  log "installed and started label=$LABEL pid=${pid:-unknown}"
}

cmd_start() {
  resolve_path
  if workspace_healthy; then
    log "refusing duplicate start; ${HOST}:${PORT} already healthy"
    exit 0
  fi
  reclaim_stale_listener
  if [[ ! -f "$PLIST" ]]; then
    write_plist
  fi
  if ! launchd_loaded; then
    launchctl bootstrap "gui/${UID_NUM}" "$PLIST"
  fi
  launchctl kickstart -k "gui/${UID_NUM}/${LABEL}" >/dev/null 2>&1 || \
    launchctl kickstart "gui/${UID_NUM}/${LABEL}" >/dev/null 2>&1 || true
  wait_for_health
  local pid
  pid="$(listener_pids | awk 'NR==1{print; exit}')"
  if [[ -n "$pid" ]]; then
    printf '%s\n' "$pid" >"$PID_FILE"
  fi
  log "started pid=${pid:-unknown}"
}

cmd_stop() {
  if launchd_loaded; then
    launchctl bootout "gui/${UID_NUM}" "$PLIST" >/dev/null 2>&1 || true
  fi
  local pid
  for pid in $(listener_pids); do
    if is_workspace_pid "$pid"; then
      log "stopping workspace pid=$pid"
      stop_pid "$pid"
    fi
  done
  rm -f "$PID_FILE"
  log "stopped"
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

cmd_status() {
  local code addr pids
  code="$(workspace_http)"
  addr="$(listener_address)"
  pids="$(listener_pids | tr '\n' ' ')"
  printf 'LABEL=%s\n' "$LABEL"
  printf 'LOADED=%s\n' "$(launchd_loaded && echo yes || echo no)"
  printf 'HTTP=%s\n' "$code"
  printf 'LISTEN=%s\n' "${addr:-none}"
  printf 'PIDS=%s\n' "${pids:-none}"
  printf 'LOG=%s\n' "$LOG_FILE"
}

usage() {
  cat <<EOF
Usage: $0 {install|start|stop|restart|status|--foreground}

  install   write the user LaunchAgent and start Workspace on 127.0.0.1:3000
  start     start via launchd, or refuse if :3000 is already healthy
  stop      boot out the LaunchAgent and stop this Workspace listener
  restart   stop, then start
  status    print health/listen/pid
EOF
}

main() {
  local cmd="${1:-status}"
  case "$cmd" in
    --foreground) cmd_foreground ;;
    install) cmd_install ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    -h|--help|help) usage ;;
    *) usage; exit 2 ;;
  esac
}

main "$@"
