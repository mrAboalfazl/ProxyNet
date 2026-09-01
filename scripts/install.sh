#!/usr/bin/env bash
#
# ProxyNet node installer.
#
# One-liner install (interactive):
#   curl -fsSL https://raw.githubusercontent.com/mrAboalfazl/ProxyNet/master/scripts/install.sh | sudo bash
#
# Non-interactive:
#   curl -fsSL <url> | sudo bash -s -- --panel https://api.civonex.ir --token ENROLL_TOKEN
#
# Uninstall:
#   sudo bash install.sh --uninstall
#
# Re-running is safe — the script is idempotent.

set -euo pipefail

# ── Constants ──────────────────────────────────────────────────────────────────

PROXYNET_VERSION="v1.0.0"
GITHUB_REPO="mrAboalfazl/ProxyNet"
DEFAULT_PANEL="https://api.civonex.ir"

# Where things live on the node
SYS_USER="proxynet"
SYS_GROUP="proxynet"
LIB_DIR="/usr/local/lib/proxynet"
BIN_DIR="/usr/local/bin"
ETC_DIR="/etc/proxynet"
STATE_DIR="/var/lib/proxynet"
LOG_FILE="/var/log/proxynet-install.log"
SYSTEMD_DIR="/etc/systemd/system"

# ── UI helpers ─────────────────────────────────────────────────────────────────

C_RESET='\033[0m'; C_RED='\033[0;31m'; C_GRN='\033[0;32m'
C_YLW='\033[0;33m'; C_CYN='\033[0;36m'; C_BLD='\033[1m'

log()  { printf '%b\n' "${C_CYN}▸${C_RESET} $*" | tee -a "$LOG_FILE"; }
ok()   { printf '%b\n' "${C_GRN}✓${C_RESET} $*" | tee -a "$LOG_FILE"; }
warn() { printf '%b\n' "${C_YLW}!${C_RESET} $*" | tee -a "$LOG_FILE" >&2; }
die()  { printf '%b\n' "${C_RED}✗${C_RESET} $*" | tee -a "$LOG_FILE" >&2; exit 1; }
step() { printf '\n%b\n' "${C_BLD}${C_CYN}==${C_RESET} ${C_BLD}$*${C_RESET}"; }

# ── Args ───────────────────────────────────────────────────────────────────────

PANEL=""
TOKEN=""
DO_UNINSTALL=0
NON_INTERACTIVE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel)         PANEL="$2"; shift 2 ;;
    --token)         TOKEN="$2"; NON_INTERACTIVE=1; shift 2 ;;
    --uninstall)     DO_UNINSTALL=1; shift ;;
    --version)       PROXYNET_VERSION="$2"; shift 2 ;;
    -h|--help)
      cat <<EOF
ProxyNet node installer

Usage:
  sudo bash install.sh [--panel URL] [--token TOKEN]
  sudo bash install.sh --uninstall

Options:
  --panel URL         Control-plane URL (default: $DEFAULT_PANEL)
  --token TOKEN       Enrollment token from the admin panel (skips interactive prompt)
  --version VER       Install a specific release (default: $PROXYNET_VERSION)
  --uninstall         Remove all ProxyNet services, binaries and config
  -h, --help          Show this help
EOF
      exit 0
      ;;
    *) die "Unknown argument: $1 (use --help)" ;;
  esac
done

# ── Preflight ──────────────────────────────────────────────────────────────────

require_root() {
  [[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0"
}

detect_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_FAMILY="${ID_LIKE:-$OS_ID}"
  else
    die "Cannot detect OS (missing /etc/os-release)"
  fi

  case "$OS_ID $OS_FAMILY" in
    *debian*|*ubuntu*) PKG_MGR="apt-get" ;;
    *rhel*|*fedora*|*centos*|*almalinux*|*rocky*) PKG_MGR="dnf" ;;
    *) die "Unsupported OS: $OS_ID (need Debian/Ubuntu or RHEL/Alma/Rocky)" ;;
  esac

  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64|amd64)   AGENT_ARCH="linux-amd64" ;;
    aarch64|arm64)  AGENT_ARCH="linux-arm64" ;;
    *) die "Unsupported CPU architecture: $ARCH" ;;
  esac
}

install_pkg() {
  local pkg="$1"
  log "installing $pkg"
  if [[ "$PKG_MGR" == "apt-get" ]]; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg" >>"$LOG_FILE" 2>&1
  else
    dnf install -y "$pkg" >>"$LOG_FILE" 2>&1
  fi
}

ensure_prereqs() {
  step "Checking prerequisites"

  # Refresh package index once (only when we're going to install something)
  local need_refresh=0
  for cmd in curl jq tar; do
    command -v "$cmd" >/dev/null || need_refresh=1
  done
  command -v node >/dev/null || need_refresh=1

  if [[ $need_refresh -eq 1 ]]; then
    log "refreshing package index"
    if [[ "$PKG_MGR" == "apt-get" ]]; then
      apt-get update -y >>"$LOG_FILE" 2>&1
    else
      dnf makecache -y >>"$LOG_FILE" 2>&1 || true
    fi
  fi

  command -v curl >/dev/null || install_pkg curl
  command -v jq >/dev/null   || install_pkg jq
  command -v tar >/dev/null  || install_pkg tar

  if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 18 ]]; then
    log "installing Node.js 20 (needed for node-relay)"
    if [[ "$PKG_MGR" == "apt-get" ]]; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >>"$LOG_FILE" 2>&1
      install_pkg nodejs
    else
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >>"$LOG_FILE" 2>&1
      install_pkg nodejs
    fi
  fi

  ok "prerequisites: curl, jq, tar, node $(node -v)"
}

# ── System user + directories ──────────────────────────────────────────────────

ensure_sysuser() {
  if ! id "$SYS_USER" &>/dev/null; then
    log "creating system user $SYS_USER"
    useradd --system --home-dir "$STATE_DIR" --shell /usr/sbin/nologin --user-group "$SYS_USER"
  fi
  install -d -m 0755 "$LIB_DIR"
  install -d -m 0750 -o "$SYS_USER" -g "$SYS_GROUP" "$ETC_DIR" "$STATE_DIR"
  touch "$LOG_FILE" && chmod 0640 "$LOG_FILE"
  ok "user + directories ready"
}

# ── Enrollment ─────────────────────────────────────────────────────────────────

detect_public_ip() {
  local ipv4 ipv6
  ipv4="$(curl -4 -fsSL --max-time 5 https://ifconfig.me/ip 2>/dev/null || true)"
  ipv6="$(curl -6 -fsSL --max-time 5 https://ifconfig.me/ip 2>/dev/null || true)"
  DETECTED_IPV4="$ipv4"
  DETECTED_IPV6="$ipv6"
}

prompt_config() {
  if [[ -z "$PANEL" ]]; then
    if [[ $NON_INTERACTIVE -eq 1 ]]; then
      PANEL="$DEFAULT_PANEL"
    else
      read -rp "Control-plane URL [$DEFAULT_PANEL]: " PANEL
      PANEL="${PANEL:-$DEFAULT_PANEL}"
    fi
  fi
  PANEL="${PANEL%/}"

  if [[ -z "$TOKEN" ]]; then
    [[ $NON_INTERACTIVE -eq 1 ]] && die "--token is required in non-interactive mode"
    echo
    echo "Paste your enrollment token from the admin panel:"
    echo "  Admin → Nodes → your node → 'Regenerate enrollment token'"
    read -rp "Token: " TOKEN
    [[ -n "$TOKEN" ]] || die "Token is required"
  fi
}

enroll_node() {
  step "Enrolling with $PANEL"
  detect_public_ip
  [[ -n "$DETECTED_IPV4" ]] && log "detected IPv4: $DETECTED_IPV4"
  [[ -n "$DETECTED_IPV6" ]] && log "detected IPv6: $DETECTED_IPV6"

  local body
  body="$(jq -nc \
    --arg t "$TOKEN" \
    --arg v "$PROXYNET_VERSION" \
    --arg ip4 "$DETECTED_IPV4" \
    --arg ip6 "$DETECTED_IPV6" \
    '{token:$t, agentVersion:$v} + (if $ip4 != "" then {ipv4Address:$ip4} else {} end) + (if $ip6 != "" then {ipv6Address:$ip6} else {} end)')"

  local response http_code
  response="$(curl -fsSL --max-time 20 -w '\n%{http_code}' \
    -H 'Content-Type: application/json' \
    -X POST "$PANEL/api/nodes/enroll" \
    -d "$body" 2>>"$LOG_FILE" || echo -e '\n000')"
  http_code="$(printf '%s' "$response" | tail -n1)"
  response="$(printf '%s' "$response" | sed '$d')"

  if [[ "$http_code" != "200" && "$http_code" != "201" ]]; then
    die "Enrollment failed (HTTP $http_code): $response"
  fi

  if [[ -z "$response" || "$response" == "null" ]]; then
    die "Enrollment token is invalid or already used. Get a fresh one from the admin panel."
  fi

  NODE_ID="$(printf '%s' "$response" | jq -r '.id')"
  NODE_SECRET="$(printf '%s' "$response" | jq -r '.nodeSecret')"
  NODE_LABEL="$(printf '%s' "$response" | jq -r '.label')"
  NODE_COUNTRY="$(printf '%s' "$response" | jq -r '.countryCode')"

  [[ -n "$NODE_ID" && "$NODE_ID" != "null" ]] || die "Enrollment response missing node id"
  [[ -n "$NODE_SECRET" && "$NODE_SECRET" != "null" ]] || die "Enrollment response missing node secret"

  ok "enrolled as node #$NODE_ID ($NODE_LABEL, $NODE_COUNTRY)"
}

write_config() {
  step "Writing config"

  cat > "$ETC_DIR/agent.json" <<EOF
{
  "node_id": "$NODE_ID",
  "control_endpoint": "$PANEL",
  "node_secret": "$NODE_SECRET"
}
EOF
  chmod 0640 "$ETC_DIR/agent.json"
  chown "$SYS_USER:$SYS_GROUP" "$ETC_DIR/agent.json"

  cat > "$ETC_DIR/relay.env" <<EOF
NODE_SECRET=$NODE_SECRET
RELAY_HOST=0.0.0.0
RELAY_PORT=9443
EOF
  chmod 0640 "$ETC_DIR/relay.env"
  chown "$SYS_USER:$SYS_GROUP" "$ETC_DIR/relay.env"

  ok "config written to $ETC_DIR (readable only by $SYS_USER)"
}

# ── Binary + relay files ──────────────────────────────────────────────────────

download_agent() {
  step "Downloading platform-agent $PROXYNET_VERSION ($AGENT_ARCH)"
  local url="https://github.com/$GITHUB_REPO/releases/download/$PROXYNET_VERSION/platform-agent-$AGENT_ARCH"
  local tmp; tmp="$(mktemp)"

  if ! curl -fsSL --max-time 60 -o "$tmp" "$url" 2>>"$LOG_FILE"; then
    rm -f "$tmp"
    die "Failed to download agent from $url"
  fi

  # Verify checksum if a .sha256 is published alongside the binary
  local sum_url="$url.sha256"
  local expected_sum
  if expected_sum="$(curl -fsSL --max-time 10 "$sum_url" 2>>"$LOG_FILE")"; then
    local actual_sum
    actual_sum="$(sha256sum "$tmp" | awk '{print $1}')"
    expected_sum="$(printf '%s' "$expected_sum" | awk '{print $1}')"
    if [[ "$actual_sum" != "$expected_sum" ]]; then
      rm -f "$tmp"
      die "Checksum mismatch (expected $expected_sum, got $actual_sum)"
    fi
    ok "checksum verified"
  else
    warn "no .sha256 published for this release — skipping checksum check"
  fi

  install -m 0755 -o root -g root "$tmp" "$LIB_DIR/platform-agent"
  rm -f "$tmp"
  ok "agent installed to $LIB_DIR/platform-agent"
}

download_relay() {
  step "Downloading node-relay"
  local url="https://raw.githubusercontent.com/$GITHUB_REPO/master/packages/node-relay/index.js"
  local tmp; tmp="$(mktemp)"
  if ! curl -fsSL --max-time 30 -o "$tmp" "$url" 2>>"$LOG_FILE"; then
    rm -f "$tmp"
    die "Failed to download node-relay from $url"
  fi
  install -m 0644 -o root -g root "$tmp" "$LIB_DIR/node-relay.js"
  rm -f "$tmp"
  ok "relay installed to $LIB_DIR/node-relay.js"
}

# ── systemd units ──────────────────────────────────────────────────────────────

write_units() {
  step "Writing systemd units"

  cat > "$SYSTEMD_DIR/proxynet-agent.service" <<EOF
[Unit]
Description=ProxyNet agent (heartbeat + control-channel)
Documentation=https://github.com/$GITHUB_REPO
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SYS_USER
Group=$SYS_GROUP
ExecStart=$LIB_DIR/platform-agent -config $ETC_DIR/agent.json
Restart=on-failure
RestartSec=5s

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictNamespaces=true
RestrictRealtime=true
LockPersonality=true
ReadWritePaths=$STATE_DIR
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
LimitNOFILE=65535

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  cat > "$SYSTEMD_DIR/proxynet-relay.service" <<EOF
[Unit]
Description=ProxyNet node relay (HTTP fetch forwarder)
Documentation=https://github.com/$GITHUB_REPO
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SYS_USER
Group=$SYS_GROUP
EnvironmentFile=$ETC_DIR/relay.env
ExecStart=/usr/bin/node $LIB_DIR/node-relay.js
Restart=on-failure
RestartSec=5s

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictNamespaces=true
RestrictRealtime=true
LockPersonality=true
ReadWritePaths=$STATE_DIR
RestrictAddressFamilies=AF_INET AF_INET6
LimitNOFILE=65535

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  ok "systemd units written"
}

# ── proxynetctl ────────────────────────────────────────────────────────────────

install_ctl() {
  step "Installing proxynetctl"
  local url="https://raw.githubusercontent.com/$GITHUB_REPO/master/scripts/proxynetctl"
  local tmp; tmp="$(mktemp)"
  if curl -fsSL --max-time 30 -o "$tmp" "$url" 2>>"$LOG_FILE"; then
    install -m 0755 -o root -g root "$tmp" "$BIN_DIR/proxynetctl"
    rm -f "$tmp"
    ok "proxynetctl installed to $BIN_DIR/proxynetctl"
  else
    rm -f "$tmp"
    warn "failed to download proxynetctl (will re-try on 'proxynetctl upgrade')"
  fi
}

# ── Firewall ──────────────────────────────────────────────────────────────────

configure_selinux() {
  # On stock AlmaLinux/Rocky/RHEL with SELinux enforcing, init_t (the default systemd
  # service domain) is denied name_connect to most network ports, which stops the
  # agent from reaching the control-plane. Enabling the 'nis_enabled' boolean is the
  # documented way to grant this class of generic-service network access.
  if ! command -v getenforce >/dev/null || [[ "$(getenforce)" != "Enforcing" ]]; then
    return 0
  fi
  step "Configuring SELinux"
  install_pkg policycoreutils-python-utils 2>/dev/null || \
    install_pkg policycoreutils-python 2>/dev/null || true
  if command -v setsebool >/dev/null; then
    setsebool -P nis_enabled 1 >>"$LOG_FILE" 2>&1 || \
      warn "setsebool nis_enabled=1 failed — the agent may be blocked from reaching $PANEL"
    ok "SELinux boolean nis_enabled=1 (allows service to reach control-plane)"
  fi
}

configure_firewall() {
  step "Configuring firewall"
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 9443/tcp comment 'ProxyNet relay' >>"$LOG_FILE" 2>&1 || true
    ok "ufw: opened 9443/tcp"
  elif command -v firewall-cmd >/dev/null && systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-port=9443/tcp >>"$LOG_FILE" 2>&1 || true
    firewall-cmd --reload >>"$LOG_FILE" 2>&1 || true
    ok "firewalld: opened 9443/tcp"
  else
    warn "no active firewall detected — make sure port 9443/tcp is reachable from $PANEL"
  fi
}

# ── Start + verify ────────────────────────────────────────────────────────────

start_services() {
  step "Starting services"
  systemctl enable --now proxynet-agent.service proxynet-relay.service >>"$LOG_FILE" 2>&1
  sleep 2

  for svc in proxynet-agent proxynet-relay; do
    if systemctl is-active --quiet "$svc"; then
      ok "$svc: active"
    else
      warn "$svc failed to start — check: journalctl -u $svc -n 50"
    fi
  done

  # Health-check the relay
  if curl -fsSL --max-time 3 http://127.0.0.1:9443/health >/dev/null 2>&1; then
    ok "relay health check: OK"
  else
    warn "relay health check failed — check: journalctl -u proxynet-relay -n 50"
  fi
}

print_summary() {
  cat <<EOF

${C_GRN}${C_BLD}══════════════════════════════════════════════════════════════${C_RESET}
${C_GRN}${C_BLD}  ProxyNet node installed successfully${C_RESET}
${C_GRN}${C_BLD}══════════════════════════════════════════════════════════════${C_RESET}

  Node ID:      ${C_BLD}$NODE_ID${C_RESET}  ($NODE_LABEL, $NODE_COUNTRY)
  Control URL:  $PANEL
  Config:       $ETC_DIR/agent.json
  Log file:     $LOG_FILE

${C_BLD}Manage this node:${C_RESET}
  proxynetctl status
  proxynetctl logs [agent|relay]
  proxynetctl restart
  proxynetctl upgrade
  proxynetctl uninstall

${C_BLD}Node acceptance:${C_RESET}
  If this node was self-submitted, an admin must approve it in the panel
  before it starts receiving traffic.

EOF
}

# ── Uninstall ──────────────────────────────────────────────────────────────────

do_uninstall() {
  step "Uninstalling ProxyNet"
  for svc in proxynet-agent proxynet-relay; do
    systemctl disable --now "$svc.service" 2>>"$LOG_FILE" || true
    rm -f "$SYSTEMD_DIR/$svc.service"
  done
  systemctl daemon-reload

  rm -rf "$LIB_DIR" "$ETC_DIR" "$STATE_DIR"
  rm -f "$BIN_DIR/proxynetctl"

  if id "$SYS_USER" &>/dev/null; then
    userdel "$SYS_USER" 2>>"$LOG_FILE" || true
  fi

  # Firewall rules are left alone — the operator may want them for other services.
  ok "uninstalled"
  echo
  echo "Note: firewall rule for 9443/tcp was NOT removed. Remove it manually if you no longer need it."
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  require_root
  detect_os
  mkdir -p "$(dirname "$LOG_FILE")"
  : > "$LOG_FILE"

  if [[ $DO_UNINSTALL -eq 1 ]]; then
    do_uninstall
    exit 0
  fi

  ensure_prereqs
  ensure_sysuser
  prompt_config
  enroll_node
  write_config
  download_agent
  download_relay
  install_ctl
  write_units
  configure_selinux
  configure_firewall
  start_services
  print_summary
}

main "$@"
