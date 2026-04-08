package watchdog

import (
"context"
"encoding/json"
"net"
"net/http"
"time"
)

type TrackInfo struct {
	Title    string `json:"title"`
	Author   string `json:"author"`
	Duration int64  `json:"duration"`
	Position int64  `json:"position"`
}

type PlayerState struct {
	GuildID   string     `json:"guildId"`
	Track     *TrackInfo `json:"track"`
	QueueSize int        `json:"queueSize"`
	Playing   bool       `json:"playing"`
	Paused    bool       `json:"paused"`
}

type StatusResponse struct {
	Players []PlayerState `json:"players"`
}

type LavalinkStats struct {
	Players        int `json:"players"`
	PlayingPlayers int `json:"playingPlayers"`
	CPU            struct {
		Cores        int     `json:"cores"`
		SystemLoad   float64 `json:"systemLoad"`
		LavalinkLoad float64 `json:"lavalinkLoad"`
	} `json:"cpu"`
	Uptime int64 `json:"uptime"`
	Memory struct {
		Used      int64 `json:"used"`
		Free      int64 `json:"free"`
		Allocated int64 `json:"allocated"`
	} `json:"memory"`
}

type Status struct {
	LavalinkOnline bool
	Stats          *LavalinkStats
	Players        []PlayerState
	PythonOnline   bool
	RustOnline     bool
}

type Watchdog struct {
	lavalinkHost     string
	lavalinkPort     string
	lavalinkPassword string
	rpcPort          string
	client           *http.Client
}

func ipv4Client() *http.Client {
	return &http.Client{
		Timeout: 2 * time.Second,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, "tcp4", addr)
			},
		},
	}
}

func New(lavalinkHost, lavalinkPort, lavalinkPassword, rpcPort string) *Watchdog {
	return &Watchdog{
		lavalinkHost:     lavalinkHost,
		lavalinkPort:     lavalinkPort,
		lavalinkPassword: lavalinkPassword,
		rpcPort:          rpcPort,
		client:           ipv4Client(),
	}
}

func (w *Watchdog) Poll() Status {
	status := Status{}
	status.PythonOnline = w.checkHTTP("http://localhost:7331/health")
	status.RustOnline = w.checkHTTP("http://localhost:7332/health")
	status.LavalinkOnline = w.checkHTTPWithAuth("http://" + w.lavalinkHost + ":" + w.lavalinkPort + "/v4/info")

	if status.LavalinkOnline {
		status.Stats = w.getStats()
	}

	status.Players = w.getPlayers()
	return status
}

func (w *Watchdog) checkHTTP(url string) bool {
	resp, err := w.client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func (w *Watchdog) checkHTTPWithAuth(url string) bool {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return false
	}
	req.Header.Set("Authorization", w.lavalinkPassword)
	resp, err := w.client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func (w *Watchdog) getStats() *LavalinkStats {
	req, err := http.NewRequest("GET", "http://"+w.lavalinkHost+":"+w.lavalinkPort+"/v4/stats", nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Authorization", w.lavalinkPassword)
	resp, err := w.client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var stats LavalinkStats
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return nil
	}
	return &stats
}

func (w *Watchdog) getPlayers() []PlayerState {
	resp, err := w.client.Get("http://localhost:" + w.rpcPort + "/status")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var result StatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil
	}
	return result.Players
}

func (w *Watchdog) StartPolling(interval time.Duration, callback func(Status)) {
	go func() {
		for {
			status := w.Poll()
			callback(status)
			time.Sleep(interval)
		}
	}()
}
