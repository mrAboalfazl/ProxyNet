package dataplane

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// XrayManager manages the lifecycle of an Xray-core child process.
type XrayManager struct {
	binaryPath string
	configPath string

	mu     sync.Mutex
	cmd    *exec.Cmd
	runCtx context.Context
	cancel context.CancelFunc
}

func NewXrayManager(binaryPath, configPath string) *XrayManager {
	return &XrayManager{
		binaryPath: binaryPath,
		configPath: configPath,
	}
}

// WriteConfig serialises xrayCfg to the config file path.
func (x *XrayManager) WriteConfig(xrayCfg any) error {
	if err := os.MkdirAll(filepath.Dir(x.configPath), 0o700); err != nil {
		return fmt.Errorf("mkdir config dir: %w", err)
	}
	data, err := json.MarshalIndent(xrayCfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal xray config: %w", err)
	}
	return os.WriteFile(x.configPath, data, 0o600)
}

// Start launches Xray-core using the current config file. Idempotent if already running.
func (x *XrayManager) Start(ctx context.Context) error {
	x.mu.Lock()
	defer x.mu.Unlock()

	if x.cmd != nil && x.cmd.Process != nil {
		return nil // already running
	}

	if _, err := os.Stat(x.binaryPath); err != nil {
		return fmt.Errorf("xray binary not found at %s: %w", x.binaryPath, err)
	}

	runCtx, cancel := context.WithCancel(ctx)
	cmd := exec.CommandContext(runCtx, x.binaryPath, "run", "-config", x.configPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("start xray: %w", err)
	}

	x.cmd = cmd
	x.runCtx = runCtx
	x.cancel = cancel

	// Watch for unexpected exit and log it.
	go func() {
		if err := cmd.Wait(); err != nil {
			fmt.Printf("[xray] process exited: %v\n", err)
		} else {
			fmt.Println("[xray] process exited cleanly")
		}
	}()

	fmt.Printf("[xray] started (pid=%d) config=%s\n", cmd.Process.Pid, x.configPath)
	return nil
}

// Stop sends SIGTERM / context-cancel to Xray and waits up to 5 s.
func (x *XrayManager) Stop() {
	x.mu.Lock()
	cancel := x.cancel
	cmd := x.cmd
	x.cmd = nil
	x.cancel = nil
	x.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if cmd != nil && cmd.Process != nil {
		done := make(chan struct{})
		go func() { cmd.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			cmd.Process.Kill()
		}
		fmt.Println("[xray] stopped")
	}
}

// Restart stops the running instance (if any), writes a new config, then starts again.
func (x *XrayManager) Restart(ctx context.Context, xrayCfg any) error {
	x.Stop()
	if err := x.WriteConfig(xrayCfg); err != nil {
		return fmt.Errorf("write config before restart: %w", err)
	}
	return x.Start(ctx)
}

// IsRunning reports whether the Xray-core process is active.
func (x *XrayManager) IsRunning() bool {
	x.mu.Lock()
	defer x.mu.Unlock()
	return x.cmd != nil && x.cmd.Process != nil
}
