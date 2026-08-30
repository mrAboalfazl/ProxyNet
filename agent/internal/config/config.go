package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	NodeID          string `json:"node_id"`
	ControlEndpoint string `json:"control_endpoint"`
	NodeSecret      string `json:"node_secret,omitempty"`

	// Xray-core settings (set these after enrollment or pre-provision them)
	XrayBinaryPath string `json:"xray_binary_path,omitempty"` // e.g. /usr/local/bin/xray
	XrayConfigPath string `json:"xray_config_path,omitempty"` // e.g. /etc/proxy-agent/xray.json

	// REALITY transport keys (generated once, stored in config)
	RealityPrivateKey string   `json:"reality_private_key,omitempty"`
	RealityShortIDs   []string `json:"reality_short_ids,omitempty"`
	RealityDest       string   `json:"reality_dest,omitempty"`        // SNI camouflage dest, e.g. "microsoft.com:443"
	RealityServerName string   `json:"reality_server_name,omitempty"` // e.g. "microsoft.com"

	// Inbound listen config
	InboundPort int    `json:"inbound_port,omitempty"` // default 443
	InboundProtocol string `json:"inbound_protocol,omitempty"` // vless_reality | shadowsocks
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	if cfg.InboundPort == 0 {
		cfg.InboundPort = 443
	}
	if cfg.InboundProtocol == "" {
		cfg.InboundProtocol = "vless_reality"
	}
	if cfg.XrayConfigPath == "" {
		cfg.XrayConfigPath = filepath.Join(filepath.Dir(path), "xray.json")
	}
	return &cfg, nil
}

func Save(path string, cfg *Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}
