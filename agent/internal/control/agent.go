package control

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/proxy-platform/agent/internal/config"
	"github.com/proxy-platform/agent/internal/dataplane"
	"github.com/proxy-platform/agent/internal/routing"
)

const agentVersion = "v1.1.0"

// Agent manages the connection to the Control Plane and coordinates
// local data-plane subprocess management.
type Agent struct {
	cfg           *config.Config
	client        *http.Client
	xray          *dataplane.XrayManager
	routingClient *routing.Client

	activeConfigVersion int64
	activeSessions      int
}

func NewAgent(cfg *config.Config) (*Agent, error) {
	a := &Agent{
		cfg: cfg,
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
		routingClient: routing.NewClient(cfg.ControlEndpoint, cfg.NodeID, cfg.NodeSecret),
	}

	if cfg.XrayBinaryPath != "" {
		a.xray = dataplane.NewXrayManager(cfg.XrayBinaryPath, cfg.XrayConfigPath)
	}

	return a, nil
}

// Run starts the agent control loop. Blocks until the context is cancelled.
func (a *Agent) Run() error {
	fmt.Printf("agent starting: node_id=%s endpoint=%s\n", a.cfg.NodeID, a.cfg.ControlEndpoint)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Pull initial routing snapshot and start Xray-core (if configured).
	if err := a.syncRoutingSnapshot(ctx); err != nil {
		fmt.Printf("[routing] initial snapshot error: %v\n", err)
	}

	heartbeatTicker := time.NewTicker(15 * time.Second)
	snapshotTicker := time.NewTicker(60 * time.Second)
	defer heartbeatTicker.Stop()
	defer snapshotTicker.Stop()

	// Send first heartbeat immediately.
	if err := a.sendHeartbeat(); err != nil {
		fmt.Printf("[heartbeat] error: %v\n", err)
	}

	for {
		select {
		case <-ctx.Done():
			if a.xray != nil {
				a.xray.Stop()
			}
			return nil
		case <-heartbeatTicker.C:
			if err := a.sendHeartbeat(); err != nil {
				fmt.Printf("[heartbeat] error: %v\n", err)
			}
		case <-snapshotTicker.C:
			if err := a.syncRoutingSnapshot(ctx); err != nil {
				fmt.Printf("[routing] snapshot sync error: %v\n", err)
			}
		}
	}
}

// syncRoutingSnapshot fetches the latest snapshot and restarts Xray-core
// if the configVersion has changed.
func (a *Agent) syncRoutingSnapshot(ctx context.Context) error {
	snap, err := a.routingClient.GetSnapshot()
	if err != nil {
		return fmt.Errorf("fetch snapshot: %w", err)
	}

	if int64(snap.ConfigVersion) == a.activeConfigVersion {
		return nil // nothing changed
	}

	fmt.Printf("[routing] snapshot updated v%d → v%d\n", a.activeConfigVersion, snap.ConfigVersion)
	a.activeConfigVersion = int64(snap.ConfigVersion)

	if a.xray == nil {
		// Xray binary not configured — just track the version.
		return nil
	}

	xrayCfg := buildXrayConfig(a.cfg, snap)
	if err := a.xray.Restart(ctx, xrayCfg); err != nil {
		return fmt.Errorf("restart xray: %w", err)
	}
	return nil
}

// buildXrayConfig generates an Xray-core config from the node config and routing snapshot.
func buildXrayConfig(cfg *config.Config, snap *routing.Snapshot) *dataplane.XrayConfig {
	xrayCfg := &dataplane.XrayConfig{
		Log: dataplane.XrayLog{Level: "warning"},
	}

	// Inbound: accept client connections using the configured protocol.
	if cfg.InboundProtocol == "vless_reality" && cfg.RealityPrivateKey != "" {
		xrayCfg.Inbounds = []dataplane.XrayInbound{{
			Listen:   "0.0.0.0",
			Port:     cfg.InboundPort,
			Protocol: "vless",
			Settings: dataplane.XrayInboundSettings{
				Decryption: "none",
			},
			StreamSettings: dataplane.XrayStreamSettings{
				Network:  "tcp",
				Security: "reality",
				RealitySettings: &dataplane.XrayRealitySettings{
					Show:        false,
					Dest:        cfg.RealityDest,
					ServerNames: []string{cfg.RealityServerName},
					PrivateKey:  cfg.RealityPrivateKey,
					ShortIDs:    cfg.RealityShortIDs,
				},
			},
			Tag: "inbound-edge",
		}}
	}

	// Outbounds: direct + blackhole defaults, then exit-node routes from snapshot.
	xrayCfg.Outbounds = []dataplane.XrayOutbound{
		{Protocol: "freedom", Tag: "direct"},
		{Protocol: "blackhole", Tag: "block"},
	}

	// Add VLESS outbounds for healthy exit nodes from the snapshot.
	for _, node := range snap.Nodes {
		if node.Status != "healthy" && node.Status != "active" {
			continue
		}
		isExit := false
		for _, r := range node.Roles {
			if r == "exit" {
				isExit = true
				break
			}
		}
		if !isExit {
			continue
		}
		for _, ep := range node.Endpoints {
			if ep.Protocol == "vless_reality" && ep.Port > 0 {
				tag := fmt.Sprintf("exit-%s", node.ID)
				xrayCfg.Outbounds = append(xrayCfg.Outbounds, dataplane.XrayOutbound{
					Protocol: "vless",
					Tag:      tag,
					Settings: dataplane.XrayOutboundSettings{
						Vnext: []dataplane.XrayVnext{{
							Address: ep.IPAddress,
							Port:    ep.Port,
							Users:   []dataplane.XrayVlessClient{{ID: "00000000-0000-0000-0000-000000000000", Flow: "xtls-rprx-vision"}},
						}},
					},
				})
				break // one endpoint per exit node for now
			}
		}
	}

	xrayCfg.Routing = dataplane.XrayRouting{
		Strategy: "IPIfNonMatch",
		Rules: []dataplane.XrayRule{
			{Type: "field", IP: []string{"geoip:private"}, OutboundTag: "direct"},
		},
	}

	return xrayCfg
}

type heartbeatPayload struct {
	AgentVersion   string `json:"agentVersion"`
	ConfigVersion  int64  `json:"configVersion"`
	ActiveSessions int    `json:"activeSessions"`
}

func (a *Agent) sendHeartbeat() error {
	payload := heartbeatPayload{
		AgentVersion:   agentVersion,
		ConfigVersion:  a.activeConfigVersion,
		ActiveSessions: a.activeSessions,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal heartbeat: %w", err)
	}

	url := a.cfg.ControlEndpoint + "/api/nodes/" + a.cfg.NodeID + "/heartbeat"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.NodeSecret)

	resp, err := a.client.Do(req)
	if err != nil {
		return fmt.Errorf("send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("unauthorized — check node secret")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("rejected: status %d", resp.StatusCode)
	}

	fmt.Printf("[heartbeat] ok node_id=%s config_v=%d ts=%s\n",
		a.cfg.NodeID, a.activeConfigVersion, time.Now().UTC().Format(time.RFC3339))
	return nil
}
