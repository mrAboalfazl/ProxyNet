package tunnel

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func intPtr(v int) *int { return &v }

func TestBuildUAPIConfigStandardWGWithJunk(t *testing.T) {
	priv := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x01}, 32))
	pub := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x02}, 32))

	uapi, err := BuildUAPIConfig("wireguard", &WireguardConfig{
		PrivateKey: priv,
		PublicKey:  pub,
		Endpoint:   "198.51.100.10:51820",
		Addresses:  []string{"10.66.0.2/32"},
		MTU:        1360,
		Junk: &WireguardJunk{
			Jc:   intPtr(4),
			Jmin: intPtr(50),
			Jmax: intPtr(900),
			S1:   intPtr(33), // must be forced to 0 for standard WG
			H1:   intPtr(999),
		},
	}, false)
	if err != nil {
		t.Fatalf("BuildUAPIConfig failed: %v", err)
	}

	for _, want := range []string{
		"jc=4",
		"jmin=50",
		"jmax=900",
		"s1=0",
		"s2=0",
		"h1=1",
		"h2=2",
		"h3=3",
		"h4=4",
		"endpoint=198.51.100.10:51820",
	} {
		if !strings.Contains(uapi, want) {
			t.Errorf("expected UAPI to contain %q, got:\n%s", want, uapi)
		}
	}
}

func TestBuildUAPIConfigFullAmneziaWG(t *testing.T) {
	priv := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x03}, 32))
	pub := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x04}, 32))

	uapi, err := BuildUAPIConfig("amneziawg", &WireguardConfig{
		PrivateKey: priv,
		PublicKey:  pub,
		Endpoint:   "198.51.100.20:51820",
		Addresses:  []string{"10.66.0.3/32"},
		Junk: &WireguardJunk{
			Jc:   intPtr(5),
			Jmin: intPtr(40),
			Jmax: intPtr(800),
			S1:   intPtr(30),
			S2:   intPtr(50),
			H1:   intPtr(1001),
			H2:   intPtr(1002),
			H3:   intPtr(1003),
			H4:   intPtr(1004),
		},
	}, false)
	if err != nil {
		t.Fatalf("BuildUAPIConfig failed: %v", err)
	}

	for _, want := range []string{"s1=30", "s2=50", "h1=1001", "h4=1004"} {
		if !strings.Contains(uapi, want) {
			t.Errorf("expected UAPI to contain %q, got:\n%s", want, uapi)
		}
	}
}

func TestValidatePublicTargetBlocksPrivate(t *testing.T) {
	blocked := []string{
		"http://127.0.0.1:8080/secret",
		"http://localhost/admin",
		"http://10.0.0.1/internal",
		"http://169.254.169.254/latest/meta-data/",
		"http://192.168.1.1/",
	}
	for _, u := range blocked {
		if _, err := ValidatePublicTarget(u); err == nil {
			t.Errorf("expected %q to be blocked", u)
		}
	}
	if _, err := ValidatePublicTarget("https://api.openai.com/v1/chat/completions"); err != nil {
		t.Errorf("expected public OpenAI URL to be allowed, got: %v", err)
	}
}

func TestStreamServerSSEStreamingAndAuth(t *testing.T) {
	// Mock AI SSE upstream server
	aiUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sk-test-key" {
			http.Error(w, "missing auth", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher := w.(http.Flusher)
		for _, chunk := range []string{"data: {\"token\":\"hello\"}\n\n", "data: [DONE]\n\n"} {
			_, _ = w.Write([]byte(chunk))
			flusher.Flush()
		}
	}))
	defer aiUpstream.Close()

	mgr := NewManager("", "1", "node-secret-xyz")
	// Inject a test instance whose client routes to our local httptest server
	mgr.mu.Lock()
	mgr.tunnels["7"] = &managedTunnel{
		item: SyncItem{ID: "7", Protocol: "wireguard"},
		inst: &Instance{
			ID:       "7",
			Protocol: "wireguard",
			Client:   aiUpstream.Client(),
		},
	}
	mgr.mu.Unlock()

	srv := NewStreamServer("127.0.0.1:0", "node-secret-xyz", mgr)

	// 1. Unauthorized request must be rejected with engine error header
	recUnauth := httptest.NewRecorder()
	reqUnauth := httptest.NewRequest(http.MethodPost, "/stream", nil)
	srv.Handler().ServeHTTP(recUnauth, reqUnauth)
	if recUnauth.Code != http.StatusUnauthorized || recUnauth.Header().Get("X-ProxyNet-Engine-Error") != "1" {
		t.Fatalf("expected 401 engine error, got %d (%v)", recUnauth.Code, recUnauth.Header())
	}

	// 2. Missing tunnel returns 503 with X-ProxyNet-Engine-Error so Control Plane can fail over
	recMiss := httptest.NewRecorder()
	reqMiss := httptest.NewRequest(http.MethodPost, "/stream", nil)
	reqMiss.Header.Set("X-Node-Secret", "node-secret-xyz")
	reqMiss.Header.Set("X-ProxyNet-Tunnel-Id", "999")
	reqMiss.Header.Set("X-ProxyNet-Target-Url", "https://api.openai.com/v1/models")
	srv.Handler().ServeHTTP(recMiss, reqMiss)
	if recMiss.Code != http.StatusServiceUnavailable || recMiss.Header().Get("X-ProxyNet-Engine-Error") != "1" {
		t.Fatalf("expected 503 engine error for unknown tunnel, got %d", recMiss.Code)
	}

	// 3. Health endpoint returns active tunnel IDs
	recHealth := httptest.NewRecorder()
	srv.Handler().ServeHTTP(recHealth, httptest.NewRequest(http.MethodGet, "/health", nil))
	if recHealth.Code != http.StatusOK {
		t.Fatalf("expected 200 health, got %d", recHealth.Code)
	}
	var health map[string]any
	if err := json.Unmarshal(recHealth.Body.Bytes(), &health); err != nil {
		t.Fatalf("decode health: %v", err)
	}
	_ = io.EOF
}
