package tunnel

import (
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net"
	"net/netip"
	"strings"
)

func base64KeyToHex(b64 string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64))
	if err != nil {
		return "", fmt.Errorf("decode base64 key: %w", err)
	}
	if len(raw) != 32 {
		return "", fmt.Errorf("wireguard key must be 32 bytes, got %d", len(raw))
	}
	return hex.EncodeToString(raw), nil
}

func resolveEndpointIPPort(endpoint string) (string, error) {
	host, port, err := net.SplitHostPort(strings.TrimSpace(endpoint))
	if err != nil {
		return "", fmt.Errorf("split endpoint %q: %w", endpoint, err)
	}
	if ip := net.ParseIP(host); ip != nil {
		return net.JoinHostPort(ip.String(), port), nil
	}
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return "", fmt.Errorf("resolve endpoint host %q: %w", host, err)
	}
	// Prefer IPv4 for widest compatibility on Iran/VPS links
	for _, ip := range ips {
		if v4 := ip.To4(); v4 != nil {
			return net.JoinHostPort(v4.String(), port), nil
		}
	}
	return net.JoinHostPort(ips[0].String(), port), nil
}

func ParseAddressesAndDNS(wg *WireguardConfig) ([]netip.Addr, []netip.Addr, error) {
	if wg == nil {
		return nil, nil, fmt.Errorf("wireguard config is nil")
	}

	var localAddrs []netip.Addr
	for _, raw := range wg.Addresses {
		s := strings.TrimSpace(raw)
		if s == "" {
			continue
		}
		if strings.Contains(s, "/") {
			pfx, err := netip.ParsePrefix(s)
			if err != nil {
				return nil, nil, fmt.Errorf("invalid address CIDR %q: %w", s, err)
			}
			localAddrs = append(localAddrs, pfx.Addr())
		} else {
			addr, err := netip.ParseAddr(s)
			if err != nil {
				return nil, nil, fmt.Errorf("invalid address %q: %w", s, err)
			}
			localAddrs = append(localAddrs, addr)
		}
	}
	if len(localAddrs) == 0 {
		return nil, nil, fmt.Errorf("at least one WireGuard interface address is required")
	}

	var dnsAddrs []netip.Addr
	for _, raw := range wg.DNS {
		s := strings.TrimSpace(raw)
		if s == "" {
			continue
		}
		if addr, err := netip.ParseAddr(s); err == nil {
			dnsAddrs = append(dnsAddrs, addr)
		}
	}
	if len(dnsAddrs) == 0 {
		dnsAddrs = []netip.Addr{
			netip.MustParseAddr("1.1.1.1"),
			netip.MustParseAddr("8.8.8.8"),
		}
	}

	return localAddrs, dnsAddrs, nil
}

// BuildUAPIConfig creates an amneziawg-go UAPI configuration string.
// When protocol is "wireguard" (standard WG server), S1/S2 are forced to 0 and
// H1..H4 to 1..4 so client-side junk packets (Jc/Jmin/Jmax and I1..I5) work
// safely against unmodified WireGuard servers without breaking handshakes.
func BuildUAPIConfig(protocol string, wg *WireguardConfig, resolveHost bool) (string, error) {
	if wg == nil {
		return "", fmt.Errorf("wireguard config is nil")
	}

	privHex, err := base64KeyToHex(wg.PrivateKey)
	if err != nil {
		return "", fmt.Errorf("private_key: %w", err)
	}
	pubHex, err := base64KeyToHex(wg.PublicKey)
	if err != nil {
		return "", fmt.Errorf("public_key: %w", err)
	}

	var pskHex string
	if strings.TrimSpace(wg.PresharedKey) != "" {
		pskHex, err = base64KeyToHex(wg.PresharedKey)
		if err != nil {
			return "", fmt.Errorf("preshared_key: %w", err)
		}
	}

	endpoint := strings.TrimSpace(wg.Endpoint)
	if resolveHost {
		endpoint, err = resolveEndpointIPPort(endpoint)
		if err != nil {
			return "", err
		}
	}

	var b strings.Builder
	fmt.Fprintf(&b, "private_key=%s\n", privHex)

	if wg.Junk != nil {
		j := wg.Junk
		jc := 0
		if j.Jc != nil && *j.Jc > 0 {
			jc = *j.Jc
		}
		jmin := 0
		if j.Jmin != nil && *j.Jmin > 0 {
			jmin = *j.Jmin
		}
		jmax := 0
		if j.Jmax != nil && *j.Jmax > 0 {
			jmax = *j.Jmax
		}

		if jc > 0 {
			if jmin > jmax {
				return "", fmt.Errorf("invalid junk size range: jmin (%d) > jmax (%d)", jmin, jmax)
			}
			fmt.Fprintf(&b, "jc=%d\n", jc)
			fmt.Fprintf(&b, "jmin=%d\n", jmin)
			fmt.Fprintf(&b, "jmax=%d\n", jmax)
		}

		if strings.EqualFold(protocol, "amneziawg") {
			if j.S1 != nil {
				fmt.Fprintf(&b, "s1=%d\n", *j.S1)
			}
			if j.S2 != nil {
				fmt.Fprintf(&b, "s2=%d\n", *j.S2)
			}
			if j.H1 != nil {
				fmt.Fprintf(&b, "h1=%d\n", *j.H1)
			}
			if j.H2 != nil {
				fmt.Fprintf(&b, "h2=%d\n", *j.H2)
			}
			if j.H3 != nil {
				fmt.Fprintf(&b, "h3=%d\n", *j.H3)
			}
			if j.H4 != nil {
				fmt.Fprintf(&b, "h4=%d\n", *j.H4)
			}
		} else {
			// Standard WireGuard server compatibility guard
			fmt.Fprintf(&b, "s1=0\ns2=0\nh1=1\nh2=2\nh3=3\nh4=4\n")
		}

		if j.I1 != "" {
			fmt.Fprintf(&b, "i1=%s\n", j.I1)
		}
		if j.I2 != "" {
			fmt.Fprintf(&b, "i2=%s\n", j.I2)
		}
		if j.I3 != "" {
			fmt.Fprintf(&b, "i3=%s\n", j.I3)
		}
		if j.I4 != "" {
			fmt.Fprintf(&b, "i4=%s\n", j.I4)
		}
		if j.I5 != "" {
			fmt.Fprintf(&b, "i5=%s\n", j.I5)
		}
	}

	fmt.Fprintf(&b, "public_key=%s\n", pubHex)
	if pskHex != "" {
		fmt.Fprintf(&b, "preshared_key=%s\n", pskHex)
	}
	fmt.Fprintf(&b, "endpoint=%s\n", endpoint)
	fmt.Fprintf(&b, "allowed_ip=0.0.0.0/0\n")
	fmt.Fprintf(&b, "allowed_ip=::/0\n")

	keepalive := wg.PersistentKeepalive
	if keepalive <= 0 {
		keepalive = 25
	}
	fmt.Fprintf(&b, "persistent_keepalive_interval=%d\n", keepalive)

	return b.String(), nil
}
