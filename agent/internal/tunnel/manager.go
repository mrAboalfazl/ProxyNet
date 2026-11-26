package tunnel

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type managedTunnel struct {
	item       SyncItem
	configHash string
	inst       *Instance
}

type Manager struct {
	controlEndpoint string
	nodeID          string
	nodeSecret      string
	apiClient       *http.Client

	mu      sync.RWMutex
	tunnels map[string]*managedTunnel
	version string
}

func NewManager(controlEndpoint, nodeID, nodeSecret string) *Manager {
	return &Manager{
		controlEndpoint: strings.TrimRight(controlEndpoint, "/"),
		nodeID:          nodeID,
		nodeSecret:      nodeSecret,
		apiClient:       &http.Client{Timeout: 15 * time.Second},
		tunnels:         make(map[string]*managedTunnel),
	}
}

func (m *Manager) GetInstance(id string) (*Instance, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	mt, ok := m.tunnels[id]
	if !ok || mt.inst == nil {
		return nil, false
	}
	return mt.inst, true
}

func (m *Manager) ActiveIDs() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ids := make([]string, 0, len(m.tunnels))
	for id := range m.tunnels {
		ids = append(ids, id)
	}
	return ids
}

func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, mt := range m.tunnels {
		_ = mt.inst.Close()
		delete(m.tunnels, id)
	}
}

// Sync fetches all upstream tunnels assigned to this host node and reconciles
// live netstack/SOCKS5 instances without disrupting unchanged active tunnels.
func (m *Manager) Sync(ctx context.Context) error {
	if m.controlEndpoint == "" || m.nodeID == "" {
		return nil
	}

	url := fmt.Sprintf("%s/api/nodes/%s/upstreams", m.controlEndpoint, m.nodeID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+m.nodeSecret)

	resp, err := m.apiClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetch upstreams: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("control plane returned HTTP %d", resp.StatusCode)
	}

	var syncResp SyncResponse
	if err := json.NewDecoder(resp.Body).Decode(&syncResp); err != nil {
		return fmt.Errorf("decode upstreams: %w", err)
	}

	m.mu.RLock()
	sameVersion := syncResp.Version != "" && syncResp.Version == m.version
	m.mu.RUnlock()
	if sameVersion {
		return nil
	}

	desired := make(map[string]SyncItem, len(syncResp.Tunnels))
	for _, item := range syncResp.Tunnels {
		desired[item.ID] = item
	}

	// Build new/changed instances outside the lock so active traffic is never stalled.
	toSwap := make(map[string]*managedTunnel)
	var startupErrors []HealthReport

	m.mu.RLock()
	for id, item := range desired {
		existing, exists := m.tunnels[id]
		if exists && existing.configHash == item.ConfigHash {
			continue
		}
		m.mu.RUnlock()
		inst, err := NewInstance(item.ID, item.Protocol, item.Config)
		if err != nil {
			fmt.Printf("[tunnel] failed to initialize tunnel %s (%s): %v\n", item.ID, item.Label, err)
			startupErrors = append(startupErrors, HealthReport{
				TunnelID:  item.ID,
				Status:    "unhealthy",
				LastError: err.Error(),
			})
		} else {
			toSwap[id] = &managedTunnel{
				item:       item,
				configHash: item.ConfigHash,
				inst:       inst,
			}
			fmt.Printf("[tunnel] initialized tunnel %s (%s, %s)\n", item.ID, item.Label, item.Protocol)
		}
		m.mu.RLock()
	}
	m.mu.RUnlock()

	var toClose []*Instance
	m.mu.Lock()
	for id, existing := range m.tunnels {
		if _, keep := desired[id]; !keep {
			toClose = append(toClose, existing.inst)
			delete(m.tunnels, id)
			fmt.Printf("[tunnel] removed tunnel %s\n", id)
		}
	}
	for id, next := range toSwap {
		if prev, exists := m.tunnels[id]; exists {
			toClose = append(toClose, prev.inst)
		}
		m.tunnels[id] = next
	}
	m.version = syncResp.Version
	m.mu.Unlock()

	for _, old := range toClose {
		_ = old.Close()
	}

	if len(startupErrors) > 0 {
		_ = m.reportHealth(ctx, startupErrors)
	}
	return nil
}

// Probe tests an active or ad-hoc upstream tunnel for exit IP, latency, and AI gateway reachability.
func (m *Manager) Probe(ctx context.Context, req ProbeRequest) ProbeResult {
	// Prefer the live running instance when the tunnel is already synced with the
	// same configHash. Spinning up a second temporary WireGuard instance with the
	// same private key hijacks the remote peer's handshake and disrupts live traffic.
	if req.TunnelID != "" {
		m.mu.RLock()
		existing, exists := m.tunnels[req.TunnelID]
		m.mu.RUnlock()
		if exists && existing.inst != nil {
			if req.Config.Type == "" || (req.ConfigHash != "" && existing.configHash == req.ConfigHash) {
				return probeInstance(ctx, existing.inst)
			}
		}
	}

	if req.Config.Type != "" {
		created, err := NewInstance(req.TunnelID, req.Protocol, req.Config)
		if err != nil {
			return ProbeResult{OK: false, Error: err.Error()}
		}
		defer created.Close()
		return probeInstance(ctx, created)
	}

	return ProbeResult{OK: false, Error: "tunnel is not active on this node"}
}

func probeInstance(ctx context.Context, inst *Instance) ProbeResult {
	probeCtx, cancel := context.WithTimeout(ctx, 18*time.Second)
	defer cancel()

	// 1. Check exit IP + round-trip latency
	start := time.Now()
	ipReq, err := http.NewRequestWithContext(probeCtx, http.MethodGet, "https://api.ipify.org", nil)
	if err != nil {
		return ProbeResult{OK: false, Error: err.Error()}
	}
	ipResp, err := inst.Client.Do(ipReq)
	if err != nil {
		return ProbeResult{OK: false, Error: fmt.Sprintf("exit ip check failed: %v", err)}
	}
	rawIP, _ := io.ReadAll(io.LimitReader(ipResp.Body, 128))
	ipResp.Body.Close()
	latencyMs := int(time.Since(start).Milliseconds())

	if ipResp.StatusCode < 200 || ipResp.StatusCode >= 300 {
		return ProbeResult{
			OK:        false,
			LatencyMs: latencyMs,
			Error:     fmt.Sprintf("ipify returned HTTP %d", ipResp.StatusCode),
		}
	}
	exitIP := strings.TrimSpace(string(rawIP))

	// 2. Check AI gateway reachability in parallel (non-403/451/5xx means IP is accepted!)
	ai := &AiCheckStatus{}
	var wg sync.WaitGroup
	checkTarget := func(targetURL string, out *bool) {
		defer wg.Done()
		cCtx, cCancel := context.WithTimeout(probeCtx, 8*time.Second)
		defer cCancel()
		r, err := http.NewRequestWithContext(cCtx, http.MethodGet, targetURL, nil)
		if err != nil {
			return
		}
		r.Header.Set("User-Agent", "ProxyNet-Probe/1.0")
		resp, err := inst.Client.Do(r)
		if err != nil {
			return
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		// OpenAI /v1/models returns 401 without an API key when reachable & NOT geo-blocked/CF-challenged (403/451).
		*out = resp.StatusCode < 500 && resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusUnavailableForLegalReasons
	}

	wg.Add(3)
	go checkTarget("https://api.openai.com/v1/models", &ai.OpenAI)
	go checkTarget("https://openrouter.ai/api/v1/models", &ai.OpenRouter)
	go checkTarget("https://opencode.ai", &ai.OpenCode)
	wg.Wait()

	return ProbeResult{
		OK:            true,
		ExitIP:        exitIP,
		LatencyMs:     latencyMs,
		AiCheckStatus: ai,
	}
}

// ProbeAllAndReport checks every active tunnel on this node and reports status to Control Plane.
func (m *Manager) ProbeAllAndReport(ctx context.Context) error {
	m.mu.RLock()
	snapshot := make([]*managedTunnel, 0, len(m.tunnels))
	for _, mt := range m.tunnels {
		snapshot = append(snapshot, mt)
	}
	m.mu.RUnlock()

	if len(snapshot) == 0 {
		return nil
	}

	reports := make([]HealthReport, 0, len(snapshot))
	for _, mt := range snapshot {
		res := probeInstance(ctx, mt.inst)
		status := "unhealthy"
		if res.OK {
			if res.AiCheckStatus != nil && (res.AiCheckStatus.OpenAI || res.AiCheckStatus.OpenRouter || res.AiCheckStatus.OpenCode) {
				status = "healthy"
			} else {
				status = "degraded"
			}
		}
		reports = append(reports, HealthReport{
			TunnelID:      mt.item.ID,
			Status:        status,
			ExitIP:        res.ExitIP,
			LatencyMs:     res.LatencyMs,
			AiCheckStatus: res.AiCheckStatus,
			LastError:     res.Error,
		})
	}

	return m.reportHealth(ctx, reports)
}

func (m *Manager) reportHealth(ctx context.Context, reports []HealthReport) error {
	if m.controlEndpoint == "" || m.nodeID == "" || len(reports) == 0 {
		return nil
	}
	body, err := json.Marshal(map[string]any{"reports": reports})
	if err != nil {
		return err
	}
	url := fmt.Sprintf("%s/api/nodes/%s/upstreams/health", m.controlEndpoint, m.nodeID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+m.nodeSecret)

	resp, err := m.apiClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("health report returned HTTP %d", resp.StatusCode)
	}
	return nil
}
