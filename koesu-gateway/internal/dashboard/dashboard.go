package dashboard

import (
"fmt"
"strings"
"time"

tea "github.com/charmbracelet/bubbletea"
"github.com/charmbracelet/lipgloss"
)

var (
purple   = lipgloss.Color("#9D4EDD")
blue     = lipgloss.Color("#4361EE")
green    = lipgloss.Color("#06D6A0")
red      = lipgloss.Color("#EF233C")
yellow   = lipgloss.Color("#FFB703")
gray     = lipgloss.Color("#6C757D")
white    = lipgloss.Color("#F8F9FA")
darkGray = lipgloss.Color("#2D2D2D")

titleStyle  = lipgloss.NewStyle().Foreground(purple).Bold(true)
	successStyle = lipgloss.NewStyle().Foreground(green)
	errorStyle  = lipgloss.NewStyle().Foreground(red)
	warnStyle   = lipgloss.NewStyle().Foreground(yellow)
	infoStyle   = lipgloss.NewStyle().Foreground(blue)
	grayStyle   = lipgloss.NewStyle().Foreground(gray)
	whiteStyle  = lipgloss.NewStyle().Foreground(white)
	barFill     = lipgloss.NewStyle().Foreground(purple)
	barEmpty    = lipgloss.NewStyle().Foreground(darkGray)
	borderStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#4A4A6A"))
	liveRed     = lipgloss.NewStyle().Foreground(red).Bold(true)
)

const ascii = `
 ___   ___   ______   ______   ______   __  __      
/___/\/__/\ /_____/\ /_____/\ /_____/\ /_/\/_/\     
\::.\ \\ \ \\:::_ \ \\::::_\/_\::::_\/_\:\ \:\ \    
 \:: \/_) \ \\:\ \ \ \\:\/___/\\:\/___/\\:\ \:\ \   
  \:. __  ( ( \:\ \ \ \\::___\/_\_::._\:\\:\ \:\ \  
   \: \ )  \ \ \:\_\ \ \\:\____/\ /____\:\\:\_\:\ \ 
    \__\/\__\/  \_____\/ \_____\/ \_____\/ \_____\/  `

type Phase int

const (
PhaseLoading Phase = iota
PhaseErasing
PhaseTyping
PhaseDashboard
)

type tickMsg time.Time

type ServiceStatus struct {
	Name   string
	Port   int
	Online bool
}

type LogEntry struct {
	Level   string
	Message string
	Time    string
}

type Model struct {
	phase        Phase
	progress     float64
	loadingMsg   string
	erasePos     int
	typePos      int
	typeText     string
	typeTarget   string
	cursorOn     bool
	liveOn       bool
	tickCount    int
	logs         []LogEntry
	services     []ServiceStatus
	lavalink     bool
	nowPlaying   string
	nowAuthor    string
	playProgress float64
	playDuration string
	isLive       bool
	queueCount   int
	cpuLoad      float64
	memUsed      int64
	uptime       int64
}

var typeSequence = []string{
	"losg", "los", "lo", "l", "",
	"L", "Lo", "Log", "Logs", "Logs ", "Logs |", "Logs ||",
	"Logs |", "Logs ||", "Logs |", "Logs ||",
}

func New() Model {
	return Model{
		phase:      PhaseLoading,
		progress:   0,
		loadingMsg: "Iniciando Koesu...",
		typeTarget: "Logs ✓",
		services: []ServiceStatus{
			{Name: "Python", Port: 7331, Online: false},
			{Name: "Rust  ", Port: 7332, Online: false},
			{Name: "Go    ", Port: 7333, Online: false},
		},
	}
}

type ProgressMsg struct {
	Progress float64
	Message  string
}

type ServiceMsg struct {
	Index  int
	Online bool
}

type LavalinkMsg struct {
	Online  bool
	CPU     float64
	MemUsed int64
	Uptime  int64
}

type NowPlayingMsg struct {
	Title    string
	Author   string
	Progress float64
	Duration string
	IsLive   bool
	Queue    int
}

type AddLogMsg struct {
	Level   string
	Message string
}

func (m Model) Init() tea.Cmd {
	return tick()
}

func tick() tea.Cmd {
	return tea.Tick(50*time.Millisecond, func(t time.Time) tea.Msg {
return tickMsg(t)
})
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if msg.String() == "q" || msg.String() == "ctrl+c" {
			return m, tea.Quit
		}

	case tickMsg:
		m.tickCount++
		m.cursorOn = m.tickCount%10 < 5
		m.liveOn = m.tickCount%20 < 10

		switch m.phase {
		case PhaseLoading:
			if m.progress < 1.0 {
				m.progress += 0.02
			} else {
				m.phase = PhaseErasing
				m.erasePos = 20
			}
		case PhaseErasing:
			if m.erasePos > 0 {
				m.erasePos--
			} else {
				m.phase = PhaseTyping
				m.typePos = 0
			}
		case PhaseTyping:
			if m.typePos < len(typeSequence) {
				m.typeText = typeSequence[m.typePos]
				if m.tickCount%6 == 0 {
					m.typePos++
				}
			} else {
				m.typeText = m.typeTarget
				m.phase = PhaseDashboard
			}
		}

		return m, tick()

	case ProgressMsg:
		m.progress = msg.Progress
		m.loadingMsg = msg.Message

	case ServiceMsg:
		if msg.Index < len(m.services) {
			m.services[msg.Index].Online = msg.Online
		}

	case LavalinkMsg:
		m.lavalink = msg.Online
		m.cpuLoad = msg.CPU
		m.memUsed = msg.MemUsed
		m.uptime = msg.Uptime

	case NowPlayingMsg:
		m.nowPlaying = msg.Title
		m.nowAuthor = msg.Author
		m.playProgress = msg.Progress
		m.playDuration = msg.Duration
		m.isLive = msg.IsLive
		m.queueCount = msg.Queue

	case AddLogMsg:
		entry := LogEntry{
			Level:   msg.Level,
			Message: msg.Message,
			Time:    time.Now().Format("15:04:05"),
		}
		m.logs = append(m.logs, entry)
		if len(m.logs) > 6 {
			m.logs = m.logs[len(m.logs)-6:]
		}
	}

	return m, nil
}

func (m Model) View() string {
	var sb strings.Builder
	sb.WriteString(titleStyle.Render(ascii) + "\n\n")

	switch m.phase {
	case PhaseLoading:
		sb.WriteString(renderLoadingBar(m.progress, m.loadingMsg))
	case PhaseErasing:
		filled := m.erasePos
		empty := 20 - filled
		bar := barFill.Render(strings.Repeat("█", filled)) +
			barEmpty.Render(strings.Repeat("░", empty))
		sb.WriteString("  " + bar + "  " + successStyle.Render("¡Listo!") + "\n\n")
	case PhaseTyping:
		cursor := ""
		if m.cursorOn {
			cursor = whiteStyle.Render("▌")
		}
		sb.WriteString("  " + whiteStyle.Render(m.typeText) + cursor + "\n\n")
	case PhaseDashboard:
		sb.WriteString(renderDashboard(m))
	}

	return sb.String()
}

func renderLoadingBar(progress float64, msg string) string {
	total := 20
	filled := int(progress * float64(total))
	if filled > total {
		filled = total
	}
	empty := total - filled
	bar := barFill.Render(strings.Repeat("█", filled)) +
		barEmpty.Render(strings.Repeat("░", empty))
	pct := int(progress * 100)
	return fmt.Sprintf("  %s  %d%%\n\n  %s\n\n", bar, pct, grayStyle.Render(msg))
}

func renderDashboard(m Model) string {
	sep := borderStyle.Render(strings.Repeat("━", 54))
	var sb strings.Builder

	sb.WriteString(sep + "\n")

	uptimeStr := ""
	if m.uptime > 0 {
		h := m.uptime / 3600000
		min := (m.uptime % 3600000) / 60000
		uptimeStr = fmt.Sprintf("  Uptime: %dh %dm", h, min)
	}

	sb.WriteString(fmt.Sprintf(" %s        %s\n",
whiteStyle.Render("SERVICIOS"),
whiteStyle.Render("LAVALINK"),
))

	for i, s := range m.services {
		status := successStyle.Render("✓ OK")
		dot := successStyle.Render("●")
		if !s.Online {
			status = errorStyle.Render("✗ FAIL")
			dot = errorStyle.Render("●")
		}
		extra := ""
		if i == 0 && m.lavalink {
			extra = fmt.Sprintf("      CPU: %.0f%%  RAM: %dMB",
m.cpuLoad*100,
m.memUsed/1024/1024,
)
		}
		if i == 1 && m.lavalink {
			lavaDot := successStyle.Render("●")
			lavaStatus := successStyle.Render("✓ Online")
			if !m.lavalink {
				lavaDot = errorStyle.Render("●")
				lavaStatus = errorStyle.Render("✗ Offline")
			}
			extra = fmt.Sprintf("      %s koesu-node %s", lavaDot, lavaStatus)
		}
		if i == 2 && uptimeStr != "" {
			extra = "     " + grayStyle.Render(uptimeStr)
		}
		sb.WriteString(fmt.Sprintf("  %s %-8s (%-4d)  %s%s\n",
dot, s.Name, s.Port, status, extra))
	}

	sb.WriteString("\n")

	if m.nowPlaying != "" {
		sb.WriteString(fmt.Sprintf(" %s\n  %s - %s\n  ",
whiteStyle.Render("REPRODUCIENDO"),
whiteStyle.Render(m.nowPlaying),
grayStyle.Render(m.nowAuthor),
))

		if m.isLive {
			sb.WriteString(grayStyle.Render(m.playDuration) + " ")
			liveStr := "LIVE"
			dot := "●"
			if m.liveOn {
				sb.WriteString(liveRed.Render(liveStr) + " " + liveRed.Render(dot))
			} else {
				sb.WriteString(liveRed.Render(liveStr) + "  ")
			}
		} else {
			total := 30
			filled := int(m.playProgress * float64(total))
			if filled > total {
				filled = total
			}
			empty := total - filled
			bar := barFill.Render(strings.Repeat("█", filled)) +
				barEmpty.Render(strings.Repeat("░", empty))
			sb.WriteString(bar + "  " + grayStyle.Render(m.playDuration))
		}

		sb.WriteString(fmt.Sprintf("\n  Cola: %s canciones\n\n",
whiteStyle.Render(fmt.Sprintf("%d", m.queueCount))))
	}

	sb.WriteString(sep + "\n")
	sb.WriteString(" " + whiteStyle.Render("Logs") + "\n")

	for _, l := range m.logs {
		levelStyle := infoStyle
		level := "INFO "
		switch l.Level {
		case "WARN":
			levelStyle = warnStyle
			level = "WARN "
		case "ERROR":
			levelStyle = errorStyle
			level = "ERROR"
		}
		sb.WriteString(fmt.Sprintf("  %s  %s  %s\n",
grayStyle.Render(l.Time),
levelStyle.Render(level),
whiteStyle.Render(l.Message),
))
	}

	sb.WriteString(sep + "\n")
	sb.WriteString(grayStyle.Render("  q → salir") + "\n")

	return sb.String()
}
