package main

import (
"fmt"
"koesu-gateway/internal/dashboard"
"koesu-gateway/internal/watchdog"
"os"
"time"

tea "github.com/charmbracelet/bubbletea"
)

func main() {
	host := getEnv("LAVALINK_HOST", "localhost")
	port := getEnv("LAVALINK_PORT", "2333")
	password := getEnv("LAVALINK_PASSWORD", "koesu")
	rpcPort := getEnv("RPC_PORT", "3000")

	m := dashboard.New()
	p := tea.NewProgram(m, tea.WithAltScreen())

	wd := watchdog.New(host, port, password, rpcPort)

	go func() {
		time.Sleep(300 * time.Millisecond)
		p.Send(dashboard.ProgressMsg{Progress: 0.3, Message: "Verificando servicios..."})
		time.Sleep(300 * time.Millisecond)
		p.Send(dashboard.ProgressMsg{Progress: 0.6, Message: "Conectando a Lavalink..."})
		time.Sleep(300 * time.Millisecond)
		p.Send(dashboard.ProgressMsg{Progress: 1.0, Message: "¡Listo!"})
	}()

	dashboard.WatchLogs(p, "/tmp/koesu-bot.log")
	wd.StartPolling(1*time.Second, func(status watchdog.Status) {
p.Send(dashboard.ServiceMsg{Index: 0, Online: status.PythonOnline})
p.Send(dashboard.ServiceMsg{Index: 1, Online: status.RustOnline})
p.Send(dashboard.ServiceMsg{Index: 2, Online: true})

cpu := float64(0)
mem := int64(0)
uptime := int64(0)
if status.Stats != nil {
cpu = status.Stats.CPU.LavalinkLoad
mem = status.Stats.Memory.Used
uptime = status.Stats.Uptime
}
p.Send(dashboard.LavalinkMsg{
Online:  status.LavalinkOnline,
CPU:     cpu,
MemUsed: mem,
Uptime:  uptime,
})

if len(status.Players) > 0 {
			player := status.Players[0]
			if player.Track != nil {
				duration := player.Track.Duration
				position := player.Track.Position
				isLive := duration == 0
				progress := float64(0)
				durationStr := msToTime(position)

				if !isLive {
					progress = float64(position) / float64(duration)
					durationStr = fmt.Sprintf("%s / %s", msToTime(position), msToTime(int64(duration)))
				}

				p.Send(dashboard.NowPlayingMsg{
Title:    player.Track.Title,
Author:   player.Track.Author,
Progress: progress,
Duration: durationStr,
IsLive:   isLive,
Queue:    player.QueueSize,
})
			}
		}
	})

	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func msToTime(ms int64) string {
	s := ms / 1000
	m := s / 60
	s = s % 60
	return fmt.Sprintf("%d:%02d", m, s)
}
