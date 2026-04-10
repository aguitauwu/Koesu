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
		var offset int64

		for {
			f, err := os.Open(logFile)
			if err != nil {
				time.Sleep(2 * time.Second)
				continue
			}

			info, _ := f.Stat()
			if offset == 0 {
				offset = info.Size()
			}

			f.Seek(offset, 0)
			scanner := bufio.NewScanner(f)

			for scanner.Scan() {
				line := stripANSI(scanner.Text())
				line = strings.TrimSpace(line)
				if line == "" || !strings.Contains(line, "[Koesu]") {
					continue
				}

				idx := strings.Index(line, "[Koesu]")
				msg := strings.TrimSpace(line[idx+7:])
				if msg == "" {
					continue
				}

				level := "INFO"
				if strings.Contains(line, "WARN") {
					level = "WARN"
				} else if strings.Contains(line, "ERROR") {
					level = "ERROR"
				}

				p.Send(AddLogMsg{Level: level, Message: msg})
			}

			offset, _ = f.Seek(0, 1)
			f.Close()
			time.Sleep(200 * time.Millisecond)
		}
	}()
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
