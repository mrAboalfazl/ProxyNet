package routing

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Snapshot is the config snapshot published by the control plane.
type Snapshot struct {
	ConfigVersion int64        `json:"configVersion"`
	Nodes         []NodeInfo   `json:"nodes"`
	Policies      []PolicyInfo `json:"policies"`
}

type NodeInfo struct {
	ID          int64          `json:"id"`
	CountryCode string         `json:"countryCode"`
	Status      string         `json:"status"` // healthy | degraded | active
	Roles       []string       `json:"roles"`  // edge | relay | exit
	Endpoints   []EndpointInfo `json:"endpoints"`
}

type EndpointInfo struct {
	IPAddress string `json:"ipAddress"`
	Port      int    `json:"port"`
	Protocol  string `json:"protocol"` // vless_reality | shadowsocks | hysteria2
}

type PolicyInfo struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	CountryCode string `json:"countryCode"`
	MaxHops     int    `json:"maxHops"`
}

// Client fetches routing snapshots from the control plane.
type Client struct {
	endpoint   string
	nodeSecret string
	nodeID     string
	http       *http.Client
}

func NewClient(endpoint, nodeID, nodeSecret string) *Client {
	return &Client{
		endpoint:   endpoint,
		nodeID:     nodeID,
		nodeSecret: nodeSecret,
		http: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GetSnapshot fetches the current routing snapshot from the control plane.
func (c *Client) GetSnapshot() (*Snapshot, error) {
	snapshotURL := strings.TrimRight(c.endpoint, "/") + "/api/nodes/" + url.PathEscape(c.nodeID) + "/snapshot"
	req, err := http.NewRequest(http.MethodGet, snapshotURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.nodeSecret)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("control plane returned %d", resp.StatusCode)
	}

	var snap Snapshot
	if err := json.NewDecoder(resp.Body).Decode(&snap); err != nil {
		return nil, fmt.Errorf("decode snapshot: %w", err)
	}
	return &snap, nil
}
