package control

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/proxy-platform/agent/internal/config"
)

type enrollRequest struct {
	Token        string `json:"token"`
	IPv4Address  string `json:"ipv4Address,omitempty"`
	AgentVersion string `json:"agentVersion"`
}

type enrollResponse struct {
	ID            int64  `json:"id"`
	Status        string `json:"status"`
	ConfigVersion int64  `json:"configVersion"`
	NodeSecret    string `json:"nodeSecret"`
}

// Enroll performs the one-time enrollment of this node with the Control Plane.
// On success it writes the received node credential to cfgPath.
func Enroll(endpoint, token, cfgPath string) error {
	body, _ := json.Marshal(enrollRequest{
		Token:        token,
		AgentVersion: agentVersion,
	})

	resp, err := http.Post(endpoint+"/api/nodes/enroll", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("enrollment request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("enrollment rejected: status %d", resp.StatusCode)
	}

	var result enrollResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse enrollment response: %w", err)
	}

	// Persist the received node identity to config file
	cfg := config.Config{
		NodeID:          fmt.Sprintf("%d", result.ID),
		ControlEndpoint: endpoint,
		NodeSecret:      result.NodeSecret,
	}
	return config.Save(cfgPath, &cfg)
}
