package tunnel

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var hopByHopHeaders = map[string]struct{}{
	"connection":          {},
	"keep-alive":          {},
	"proxy-authenticate":  {},
	"proxy-authorization": {},
	"te":                  {},
	"trailer":             {},
	"transfer-encoding":   {},
	"upgrade":             {},
	"host":                {},
	"content-length":      {},
}

var strippedRequestHeaders = map[string]struct{}{
	"x-forwarded-for":     {},
	"x-real-ip":           {},
	"x-forwarded-host":    {},
	"x-forwarded-proto":   {},
	"x-forwarded-port":    {},
	"x-forwarded-by":      {},
	"forwarded":           {},
	"cf-connecting-ip":    {},
	"cf-ipcountry":        {},
	"cf-ray":              {},
	"cf-visitor":          {},
	"true-client-ip":      {},
	"x-client-ip":         {},
	"x-cluster-client-ip": {},
	"via":                 {},
}

type StreamServer struct {
	listenAddr string
	nodeSecret string
	manager    *Manager
	server     *http.Server
}

func NewStreamServer(listenAddr, nodeSecret string, manager *Manager) *StreamServer {
	s := &StreamServer{
		listenAddr: listenAddr,
		nodeSecret: nodeSecret,
		manager:    manager,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/probe/", s.handleProbe)
	mux.HandleFunc("/stream", s.handleStream)

	s.server = &http.Server{
		Addr:              listenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 15 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	return s
}

func (s *StreamServer) Start() error {
	fmt.Printf("[tunnel-proxy] listening on %s\n", s.listenAddr)
	err := s.server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (s *StreamServer) Shutdown(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}

func (s *StreamServer) Handler() http.Handler {
	return s.server.Handler
}

func (s *StreamServer) authorized(r *http.Request) bool {
	provided := r.Header.Get("X-Node-Secret")
	if provided == "" || s.nodeSecret == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(s.nodeSecret)) == 1
}

func writeEngineError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-ProxyNet-Engine-Error", "1")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(msg))
}

func (s *StreamServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":        "ok",
		"activeTunnels": s.manager.ActiveIDs(),
		"ts":            time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *StreamServer) handleProbe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.authorized(r) {
		writeEngineError(w, http.StatusUnauthorized, "invalid node secret")
		return
	}
	tunnelID := strings.TrimPrefix(r.URL.Path, "/probe/")
	var req ProbeRequest
	if r.Body != nil {
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req)
	}
	if req.TunnelID == "" {
		req.TunnelID = tunnelID
	}

	result := s.manager.Probe(r.Context(), req)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func (s *StreamServer) handleStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeEngineError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !s.authorized(r) {
		writeEngineError(w, http.StatusUnauthorized, "invalid node secret")
		return
	}

	tunnelID := strings.TrimSpace(r.Header.Get("X-ProxyNet-Tunnel-Id"))
	targetURLRaw := strings.TrimSpace(r.Header.Get("X-ProxyNet-Target-Url"))
	targetMethod := strings.ToUpper(strings.TrimSpace(r.Header.Get("X-ProxyNet-Target-Method")))
	if targetMethod == "" {
		targetMethod = http.MethodGet
	}

	if tunnelID == "" || targetURLRaw == "" {
		writeEngineError(w, http.StatusBadRequest, "missing tunnel id or target url")
		return
	}

	targetURL, err := ValidatePublicTarget(targetURLRaw)
	if err != nil {
		writeEngineError(w, http.StatusForbidden, err.Error())
		return
	}

	inst, ok := s.manager.GetInstance(tunnelID)
	if !ok {
		writeEngineError(w, http.StatusServiceUnavailable, fmt.Sprintf("tunnel %s is not active", tunnelID))
		return
	}

	var bodyReader io.Reader
	if r.ContentLength != 0 {
		bodyReader = r.Body
	}

	outReq, err := http.NewRequestWithContext(r.Context(), targetMethod, targetURL.String(), bodyReader)
	if err != nil {
		writeEngineError(w, http.StatusBadRequest, fmt.Sprintf("build upstream request: %v", err))
		return
	}
	if r.ContentLength > 0 {
		outReq.ContentLength = r.ContentLength
	}

	if rawHeaders := r.Header.Get("X-ProxyNet-Target-Headers"); rawHeaders != "" {
		var hdrs map[string]string
		if err := json.Unmarshal([]byte(rawHeaders), &hdrs); err == nil {
			for k, v := range hdrs {
				lower := strings.ToLower(k)
				if _, skip := hopByHopHeaders[lower]; skip {
					continue
				}
				if _, skip := strippedRequestHeaders[lower]; skip {
					continue
				}
				outReq.Header.Set(k, v)
			}
		}
	}
	if outReq.Header.Get("User-Agent") == "" {
		outReq.Header.Set("User-Agent", "ProxyNet-TunnelProxy/1.0")
	}

	resp, err := inst.Client.Do(outReq)
	if err != nil {
		writeEngineError(w, http.StatusBadGateway, fmt.Sprintf("tunnel %s dial/fetch failed: %v", tunnelID, err))
		return
	}
	defer resp.Body.Close()

	for k, vals := range resp.Header {
		if _, skip := hopByHopHeaders[strings.ToLower(k)]; skip {
			continue
		}
		for _, v := range vals {
			w.Header().Add(k, v)
		}
	}
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(resp.StatusCode)

	flusher, canFlush := w.(http.Flusher)
	if canFlush {
		flusher.Flush()
	}

	buf := make([]byte, 16*1024)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				return
			}
			if canFlush {
				flusher.Flush()
			}
		}
		if readErr != nil {
			return
		}
	}
}
