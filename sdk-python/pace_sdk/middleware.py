from functools import wraps

from .client import Pace
from .types import PaceConfig


def flask_middleware(pace: Pace):
    """Flask decorator"""

    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            from flask import jsonify, request

            xff = request.headers.get("X-Forwarded-For")
            ip = (
                request.headers.get("CF-Connecting-IP")
                or request.headers.get("X-Real-IP")
                or (xff.split(",")[0].strip() if xff else None)
                or request.remote_addr
                or "127.0.0.1"
            )
            identity = request.headers.get(pace.config.identity_header) if pace.config.identity_header else None
            result = pace.check_with_key(identity or "", ip, request.path)
            if not result.allowed:
                return jsonify({"message": "Rate limit exceeded"}), 429
            return f(*args, **kwargs)

        return wrapper

    return decorator


class FastAPIMiddleware:
    """FastAPI middleware"""

    def __init__(self, app, config: PaceConfig):
        self.app = app
        self.pace = Pace(config)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            from starlette.requests import Request
            from starlette.responses import JSONResponse

            request = Request(scope, receive)
            xff = request.headers.get("x-forwarded-for")
            ip = (
                request.headers.get("cf-connecting-ip")
                or request.headers.get("x-real-ip")
                or (xff.split(",")[0].strip() if xff else None)
                or (request.client.host if request.client else None)
                or "127.0.0.1"
            )
            identity = request.headers.get(self.pace.config.identity_header) if self.pace.config.identity_header else None
            result = self.pace.check_with_key(identity or "", ip, request.url.path)
            if not result.allowed:
                response = JSONResponse({"message": "Rate limit exceeded"}, status_code=429)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
