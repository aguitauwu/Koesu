package dashboard

import (
"bufio"
"os"
"strings"
"time"

tea "github.com/charmbracelet/bubbletea"
)

func WatchLogs(p *tea.Program, logFile string) {
	go func() {
		for {
			f, err := os.Open(logFile)
			if err != nil {
				time.Sleep(2 * time.Second)
				continue
			}

			f.Seek(0, 2)
			scanner := bufio.NewScanner(f)

			for scanner.Scan() {
				line := scanner.Text()
				if line == "" {
					continue
				}
				level, msg := parseLine(line)
				if msg != "" {
					p.Send(AddLogMsg{Level: level, Message: msg})
				}
			}

			f.Close()
			time.Sleep(100 * time.Millisecond)
		}
	}()
}

func parseLine(line string) (string, string) {
	line = stripANSI(line)

	level := "INFO"
	if strings.Contains(line, "WARN") {
		level = "WARN"
	} else if strings.Contains(line, "ERROR") {
		level = "ERROR"
	}

	idx := strings.Index(line, "[Koesu]")
	if idx != -1 {
		msg := strings.TrimSpace(line[idx+7:])
		if msg != "" {
			return level, msg
		}
	}

	if strings.Contains(line, "server_started") {
		return "INFO", "Servidor Python iniciado"
	}
	if strings.Contains(line, "presentation_generated") {
		return "INFO", "DJ presentación generada"
	}
	if strings.Contains(line, "tts_generated") {
		return "INFO", "TTS generado"
	}

	return "", ""
}

func stripANSI(s string) string {
	result := strings.Builder{}
	i := 0
	for i < len(s) {
		if s[i] == 0x1b && i+1 < len(s) && s[i+1] == '[' {
			i += 2
			for i < len(s) && s[i] != 'm' {
				i++
			}
			i++
		} else {
			result.WriteByte(s[i])
			i++
		}
	}
	return result.String()
}
