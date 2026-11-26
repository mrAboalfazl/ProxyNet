package tunnel

type WireguardJunk struct {
	Jc   *int   `json:"jc,omitempty"`
	Jmin *int   `json:"jmin,omitempty"`
	Jmax *int   `json:"jmax,omitempty"`
	S1   *int   `json:"s1,omitempty"`
	S2   *int   `json:"s2,omitempty"`
	H1   *int   `json:"h1,omitempty"`
	H2   *int   `json:"h2,omitempty"`
	H3   *int   `json:"h3,omitempty"`
	H4   *int   `json:"h4,omitempty"`
	I1   string `json:"i1,omitempty"`
	I2   string `json:"i2,omitempty"`
	I3   string `json:"i3,omitempty"`
	I4   string `json:"i4,omitempty"`
	I5   string `json:"i5,omitempty"`
}

type WireguardConfig struct {
	PrivateKey          string         `json:"privateKey"`
	PublicKey           string         `json:"publicKey"`
	PresharedKey        string         `json:"presharedKey,omitempty"`
	Endpoint            string         `json:"endpoint"`
	Addresses           []string       `json:"addresses"`
	DNS                 []string       `json:"dns"`
	MTU                 int            `json:"mtu"`
	PersistentKeepalive int            `json:"persistentKeepalive"`
	Junk                *WireguardJunk `json:"junk,omitempty"`
}

type ProxyConfig struct {
	Scheme   string `json:"scheme"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
}

type UpstreamConfigPayload struct {
	Type  string           `json:"type"`
	WG    *WireguardConfig `json:"wg,omitempty"`
	Proxy *ProxyConfig     `json:"proxy,omitempty"`
}

type SyncItem struct {
	ID          string                `json:"id"`
	Label       string                `json:"label"`
	Protocol    string                `json:"protocol"`
	CountryCode string                `json:"countryCode"`
	Priority    int                   `json:"priority"`
	ConfigHash  string                `json:"configHash"`
	Config      UpstreamConfigPayload `json:"config"`
}

type SyncResponse struct {
	NodeID  string     `json:"nodeId"`
	Version string     `json:"version"`
	Tunnels []SyncItem `json:"tunnels"`
}

type AiCheckStatus struct {
	OpenAI     bool `json:"openai"`
	OpenRouter bool `json:"openrouter"`
	OpenCode   bool `json:"opencode"`
}

type ProbeRequest struct {
	TunnelID   string                `json:"tunnelId"`
	Protocol   string                `json:"protocol"`
	ConfigHash string                `json:"configHash,omitempty"`
	Config     UpstreamConfigPayload `json:"config"`
}

type ProbeResult struct {
	OK            bool           `json:"ok"`
	ExitIP        string         `json:"exitIp,omitempty"`
	LatencyMs     int            `json:"latencyMs,omitempty"`
	AiCheckStatus *AiCheckStatus `json:"aiCheckStatus,omitempty"`
	Error         string         `json:"error,omitempty"`
}

type HealthReport struct {
	TunnelID      string         `json:"tunnelId"`
	Status        string         `json:"status"`
	ExitIP        string         `json:"exitIp,omitempty"`
	LatencyMs     int            `json:"latencyMs,omitempty"`
	AiCheckStatus *AiCheckStatus `json:"aiCheckStatus,omitempty"`
	LastError     string         `json:"lastError,omitempty"`
}
