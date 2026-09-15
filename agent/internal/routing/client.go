package routing

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Snapshot is the config snapshot published by the control plane.
type Snapshot struct {
	ConfigVersion Int64        `json:"version"`
	Nodes         []NodeInfo   `json:"nodes"`
	Policies      []PolicyInfo `json:"policies"`
}

// Int64 accepts either a JSON number or a decimal string. The control plane
// serializes database bigint values as strings so they remain safe in browsers.
type Int64 int64

func (value *Int64) UnmarshalJSON(data []byte) error {
	text := strings.Trim(string(data), "\"")
	parsed, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid integer %q: %w", text, err)
	}
	*value = Int64(parsed)
	return nil
}

type NodeInfo struct {
	ID          string         `json:"id"`
	CountryCode string         `json:"countryCode"`
	Status      string         `json:"status"` // healthy | degraded | active
	Roles       []string       `json:"roles"`  // edge | relay | exit
	Endpoints   []EndpointInfo `json:"endpoints"`
}

type EndpointInfo struct {
	IPAddress string `json:"ipAddress"`
	Port      int    `json:"port"`
	Protocol  string `json:"transportType"` // vless_reality | shadowsocks | hysteria2
}

type PolicyInfo struct {
	ID          string `json:"id"`
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
