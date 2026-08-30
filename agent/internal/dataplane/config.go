package dataplane

// XrayConfig is the top-level Xray-core JSON config.
// Only the fields needed for the Edge-node inbound are included here;
// add more inbound/outbound types as transports are added.
type XrayConfig struct {
	Log       XrayLog       `json:"log"`
	Inbounds  []XrayInbound `json:"inbounds"`
	Outbounds []XrayOutbound `json:"outbounds"`
	Routing   XrayRouting   `json:"routing"`
}

type XrayLog struct {
	Level string `json:"loglevel"` // debug | info | warning | error | none
}

// ---- Inbound ----

type XrayInbound struct {
	Listen         string              `json:"listen"`
	Port           int                 `json:"port"`
	Protocol       string              `json:"protocol"`
	Settings       XrayInboundSettings `json:"settings"`
	StreamSettings XrayStreamSettings  `json:"streamSettings"`
	Tag            string              `json:"tag,omitempty"`
}

type XrayInboundSettings struct {
	// VLESS
	Clients    []XrayVlessClient `json:"clients,omitempty"`
	Decryption string            `json:"decryption,omitempty"`
	// Shadowsocks
	Method   string `json:"method,omitempty"`
	Password string `json:"password,omitempty"`
}

type XrayVlessClient struct {
	ID         string `json:"id"`
	Flow       string `json:"flow,omitempty"` // xtls-rprx-vision for XTLS
	Level      int    `json:"level,omitempty"`
}

type XrayStreamSettings struct {
	Network         string              `json:"network"` // tcp | ws | grpc
	Security        string              `json:"security"` // none | tls | reality
	RealitySettings *XrayRealitySettings `json:"realitySettings,omitempty"`
	TLSSettings     *XrayTLSSettings    `json:"tlsSettings,omitempty"`
}

type XrayRealitySettings struct {
	Show        bool     `json:"show"`
	Dest        string   `json:"dest"`        // target for REALITY SNI camouflage, e.g. "microsoft.com:443"
	ServerNames []string `json:"serverNames"` // allowed SNI values
	PrivateKey  string   `json:"privateKey"`
	ShortIDs    []string `json:"shortIds"`
}

type XrayTLSSettings struct {
	ServerName string `json:"serverName,omitempty"`
}

// ---- Outbound ----

type XrayOutbound struct {
	Protocol string              `json:"protocol"`
	Tag      string              `json:"tag,omitempty"`
	Settings XrayOutboundSettings `json:"settings,omitempty"`
}

type XrayOutboundSettings struct {
	// VLESS outbound (for routing to exit nodes)
	Vnext []XrayVnext `json:"vnext,omitempty"`
	// Shadowsocks outbound
	Servers []XrayShadowsocksServer `json:"servers,omitempty"`
}

type XrayVnext struct {
	Address string        `json:"address"`
	Port    int           `json:"port"`
	Users   []XrayVlessClient `json:"users"`
}

type XrayShadowsocksServer struct {
	Address  string `json:"address"`
	Port     int    `json:"port"`
	Method   string `json:"method"`
	Password string `json:"password"`
}

// ---- Routing ----

type XrayRouting struct {
	Strategy string       `json:"domainStrategy,omitempty"`
	Rules    []XrayRule   `json:"rules,omitempty"`
}

type XrayRule struct {
	Type        string   `json:"type"`
	IP          []string `json:"ip,omitempty"`
	OutboundTag string   `json:"outboundTag"`
}
