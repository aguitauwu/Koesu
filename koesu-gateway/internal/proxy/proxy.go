package proxy

import (
"context"
"fmt"
"log"
"net"
"net/http"
"net/http/httputil"
"net/url"
"strings"
"sync"
"time"

"github.com/gorilla/websocket"
)

type Node struct {
	Host     string
	Port     string
	Password string
	Active   bool
}

type Proxy struct {
	nodes    []*Node
	active   int
	mu       sync.RWMutex
	upgrader websocket.Upgrader
	dialer   *websocket.Dialer
	transport *http.Transport
}

func ipv4Transport() *http.Transport {
	return &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "tcp4", addr)
		},
	}
}

func New(nodes []*Node) *Proxy {
	return &Proxy{
		nodes: nodes,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		dialer: &websocket.Dialer{
			NetDial: func(network, addr string) (net.Conn, error) {
				return net.Dial("tcp4", addr)
			},
		},
		transport: ipv4Transport(),
	}
}

func (p *Proxy) ActiveNode() *Node {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.nodes[p.active]
}

func (p *Proxy) StartHealthCheck(interval time.Duration) {
	go func() {
		for {
			time.Sleep(interval)
			p.mu.Lock()
			for i, node := range p.nodes {
				conn, err := net.DialTimeout("tcp4", node.Host+":"+node.Port, 2*time.Second)
				if err != nil {
					node.Active = false
					if i == p.active && i+1 < len(p.nodes) {
						p.active = i + 1
						log.Printf("Nodo %d caído, cambiando a nodo %d", i, p.active)
					}
				} else {
					conn.Close()
					node.Active = true
					if p.active != 0 && p.nodes[0].Active {
						p.active = 0
						log.Printf("Nodo principal restaurado")
					}
				}
			}
			p.mu.Unlock()
		}
	}()
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	node := p.ActiveNode()

	if strings.ToLower(r.Header.Get("Upgrade")) == "websocket" {
		p.handleWebSocket(w, r, node)
		return
	}

	target, _ := url.Parse(fmt.Sprintf("http://%s:%s", node.Host, node.Port))
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.Transport = p.transport
	proxy.ServeHTTP(w, r)
}

func (p *Proxy) handleWebSocket(w http.ResponseWriter, r *http.Request, node *Node) {
	clientConn, err := p.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Error upgrading client WebSocket: %v", err)
		return
	}
	defer clientConn.Close()

	targetURL := fmt.Sprintf("ws://%s:%s%s", node.Host, node.Port, r.URL.RequestURI())
	headers := http.Header{}
	for k, v := range r.Header {
		if k != "Upgrade" && k != "Connection" && k != "Sec-Websocket-Key" &&
			k != "Sec-Websocket-Version" && k != "Sec-Websocket-Extensions" {
			headers[k] = v
		}
	}

	targetConn, _, err := p.dialer.Dial(targetURL, headers)
	if err != nil {
		log.Printf("Error connecting to Lavalink: %v", err)
		return
	}
	defer targetConn.Close()

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			mt, msg, err := targetConn.ReadMessage()
			if err != nil {
				return
			}
			if err := clientConn.WriteMessage(mt, msg); err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-done:
			return
		default:
			mt, msg, err := clientConn.ReadMessage()
			if err != nil {
				return
			}
			if err := targetConn.WriteMessage(mt, msg); err != nil {
				return
			}
		}
	}
}

func (p *Proxy) ListenAndServe(addr string) error {
	server := &http.Server{
		Addr:    addr,
		Handler: p,
	}
	log.Printf("Proxy escuchando en %s", addr)
	return server.ListenAndServe()
}
