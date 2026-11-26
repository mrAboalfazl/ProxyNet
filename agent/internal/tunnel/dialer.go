package tunnel

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/amnezia-vpn/amneziawg-go/conn"
	"github.com/amnezia-vpn/amneziawg-go/device"
	"github.com/amnezia-vpn/amneziawg-go/tun/netstack"
	"golang.org/x/net/proxy"
)

// Instance holds an active userspace outbound tunnel and its pooled HTTP/2 client.
type Instance struct {
	ID       string
	Protocol string
	Client   *http.Client
	closeFn  func() error
}

func (i *Instance) Close() error {
	if i == nil {
		return nil
	}
	if i.Client != nil {
		if tr, ok := i.Client.Transport.(*http.Transport); ok {
			tr.CloseIdleConnections()
		}
	}
	if i.closeFn != nil {
		return i.closeFn()
	}
	return nil
}

func NewInstance(id, protocol string, payload UpstreamConfigPayload) (*Instance, error) {
	switch payload.Type {
	case "wireguard", "amneziawg":
		return newWireguardInstance(id, protocol, payload.WG)
	case "socks5", "http":
		return newProxyInstance(id, payload.Type, payload.Proxy)
	default:
		return nil, fmt.Errorf("unsupported upstream config type %q", payload.Type)
	}
}

func newWireguardInstance(id, protocol string, wg *WireguardConfig) (*Instance, error) {
	if wg == nil {
		return nil, fmt.Errorf("missing wireguard config")
	}

	localAddrs, dnsAddrs, err := ParseAddressesAndDNS(wg)
	if err != nil {
		return nil, err
	}

	mtu := wg.MTU
	if mtu < 1280 || mtu > 1420 {
		mtu = 1360
	}

	uapiConf, err := BuildUAPIConfig(protocol, wg, true)
	if err != nil {
		return nil, err
	}

	tunDev, tnet, err := netstack.CreateNetTUN(localAddrs, dnsAddrs, mtu)
	if err != nil {
		return nil, fmt.Errorf("create netstack tun: %w", err)
	}

	logger := device.NewLogger(device.LogLevelError, fmt.Sprintf("[wg-%s] ", id))
	dev := device.NewDevice(tunDev, conn.NewDefaultBind(), logger)

	if err := dev.IpcSet(uapiConf); err != nil {
		dev.Close()
		return nil, fmt.Errorf("apply uapi config: %w", err)
	}
	if err := dev.Up(); err != nil {
		dev.Close()
		return nil, fmt.Errorf("bring up wg device: %w", err)
	}

	dialContext := func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		if ip := net.ParseIP(host); ip != nil && IsBlockedIP(ip) {
			return nil, fmt.Errorf("blocked private destination %s", host)
		}
		return tnet.DialContext(ctx, network, addr)
	}

	transport := &http.Transport{
		DialContext:           dialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          128,
		MaxIdleConnsPerHost:   64,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   15 * time.Second,
		ResponseHeaderTimeout: 120 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
	}

	return &Instance{
		ID:       id,
		Protocol: protocol,
		Client: &http.Client{
			Transport: transport,
			// Do not set a global Client.Timeout because AI SSE streams can run for minutes.
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		closeFn: func() error {
			dev.Close()
			return nil
		},
	}, nil
}

func newProxyInstance(id, protocol string, cfg *ProxyConfig) (*Instance, error) {
	if cfg == nil {
		return nil, fmt.Errorf("missing proxy config")
	}
	if cfg.Host == "" || cfg.Port < 1 || cfg.Port > 65535 {
		return nil, fmt.Errorf("invalid proxy host/port")
	}

	addr := net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	var transport *http.Transport

	if strings.EqualFold(cfg.Scheme, "socks5") {
		var auth *proxy.Auth
		if cfg.Username != "" || cfg.Password != "" {
			auth = &proxy.Auth{User: cfg.Username, Password: cfg.Password}
		}
		baseDialer := &net.Dialer{
			Timeout:   15 * time.Second,
			KeepAlive: 30 * time.Second,
		}
		socksDialer, err := proxy.SOCKS5("tcp", addr, auth, baseDialer)
		if err != nil {
			return nil, fmt.Errorf("init socks5 dialer: %w", err)
		}
		ctxDialer, hasCtx := socksDialer.(proxy.ContextDialer)
		dialContext := func(ctx context.Context, network, targetAddr string) (net.Conn, error) {
			host, _, err := net.SplitHostPort(targetAddr)
			if err != nil {
				return nil, err
			}
			if ip := net.ParseIP(host); ip != nil && IsBlockedIP(ip) {
				return nil, fmt.Errorf("blocked private destination %s", host)
			}
			if hasCtx {
				return ctxDialer.DialContext(ctx, network, targetAddr)
			}
			return socksDialer.Dial(network, targetAddr)
		}

		transport = &http.Transport{
			DialContext:           dialContext,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          128,
			MaxIdleConnsPerHost:   64,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   15 * time.Second,
			ResponseHeaderTimeout: 120 * time.Second,
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		}
	} else {
		proxyURL := &url.URL{
			Scheme: "http",
			Host:   addr,
		}
		if cfg.Username != "" {
			proxyURL.User = url.UserPassword(cfg.Username, cfg.Password)
		}
		transport = &http.Transport{
			Proxy:                 http.ProxyURL(proxyURL),
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          128,
			MaxIdleConnsPerHost:   64,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   15 * time.Second,
			ResponseHeaderTimeout: 120 * time.Second,
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		}
	}

	return &Instance{
		ID:       id,
		Protocol: protocol,
		Client: &http.Client{
			Transport: transport,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}, nil
}
