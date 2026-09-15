package routing

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetSnapshotUsesNodeAuthenticatedEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		if r.URL.Path != "/api/nodes/42/snapshot" {
			t.Fatalf("path = %s, want node snapshot endpoint", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer node-secret" {
			t.Fatalf("authorization = %q, want node bearer secret", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"version":"1","nodes":[{"id":"42","countryCode":"DE","status":"healthy","roles":["exit"],"endpoints":[{"ipAddress":"192.0.2.10","port":443,"transportType":"vless_reality"}]}],"policies":[{"id":"7","name":"default","countryCode":"DE","maxHops":1}]}`))
	}))
	defer server.Close()

	snapshot, err := NewClient(server.URL, "42", "node-secret").GetSnapshot()
	if err != nil {
		t.Fatalf("GetSnapshot() error = %v", err)
	}
	if snapshot.ConfigVersion != 1 {
		t.Fatalf("config version = %d, want 1", snapshot.ConfigVersion)
	}
	if got := snapshot.Nodes[0].Endpoints[0].Protocol; got != "vless_reality" {
		t.Fatalf("endpoint protocol = %q, want vless_reality", got)
	}
}
