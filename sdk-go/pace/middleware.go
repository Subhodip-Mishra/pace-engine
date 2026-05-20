package pace

import (
	"net/http"
)

func (p *Pace) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.Header.Get("X-Forwarded-For")
		if ip == "" {
			ip = r.RemoteAddr
		}

		identity := ""
		if p.config.IdentityHeader != "" {
			identity = r.Header.Get(p.config.IdentityHeader)
		}

		result := p.CheckWithKey(identity, ip, r.URL.Path)
		if !result.Allowed {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"message":"Rate limit exceeded"}`))
			return
		}

		next.ServeHTTP(w, r)
	})
}
