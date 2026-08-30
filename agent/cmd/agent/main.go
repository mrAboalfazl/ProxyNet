package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/proxy-platform/agent/internal/config"
	"github.com/proxy-platform/agent/internal/control"
)

var (
	enroll   = flag.Bool("enroll", false, "Enroll this node with the control plane")
	token    = flag.String("token", "", "Enrollment token (required with --enroll)")
	endpoint = flag.String("endpoint", "", "Control plane endpoint (required with --enroll)")
	cfgPath  = flag.String("config", "/etc/proxy-agent/agent.json", "Agent config file path")
)

func main() {
	flag.Parse()

	if *enroll {
		if *token == "" || *endpoint == "" {
			fmt.Fprintln(os.Stderr, "error: --token and --endpoint are required for enrollment")
			os.Exit(1)
		}
		if err := control.Enroll(*endpoint, *token, *cfgPath); err != nil {
			fmt.Fprintf(os.Stderr, "enrollment failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("enrollment successful")
		return
	}

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load config: %v\n", err)
		os.Exit(1)
	}

	agent, err := control.NewAgent(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to initialize agent: %v\n", err)
		os.Exit(1)
	}

	if err := agent.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "agent exited with error: %v\n", err)
		os.Exit(1)
	}
}
