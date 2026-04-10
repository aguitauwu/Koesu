package dashboard

import (
"encoding/json"
"net/http"

tea "github.com/charmbracelet/bubbletea"
)

type LogPayload struct {
	Level   string `json:"level"`
	Message string `json:"msg"`
}

func StartLogServer(p *tea.Program) {
	mux := http.NewServeMux()
	mux.HandleFunc("/log", func(w http.ResponseWriter, r *http.Request) {
if r.Method != http.MethodPost {
w.WriteHeader(http.StatusMethodNotAllowed)
return
}
var payload LogPayload
if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		p.Send(AddLogMsg{Level: payload.Level, Message: payload.Message})
		w.WriteHeader(http.StatusOK)
	})
	go http.ListenAndServe(":7333", mux)
}
