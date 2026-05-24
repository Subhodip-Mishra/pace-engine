# pace_sdk/helpers.py
from typing import Callable
from functools import wraps

class PaceFastAPI:
    def __init__(self, pace_engine):
        self.pace = pace_engine

    def limit(self, route: str = "/"):
        from fastapi import Request, HTTPException
        def _dependency(request: Request):
            client_ip = request.client.host if request.client else "127.0.0.1"
            result = self.pace.check(ip=client_ip, route=route)
            if not result.allowed:
                raise HTTPException(status_code=429, detail="Rate limit exceeded")
        return _dependency

def pace_django(pace_engine, route: str = "/"):
    def decorator(view_func: Callable) -> Callable:
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            from django.http import JsonResponse
            
            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            client_ip = x_forwarded_for.split(',')[0].strip() if x_forwarded_for else request.META.get('REMOTE_ADDR', '127.0.0.1')
                
            result = pace_engine.check(ip=client_ip, route=route)
            if not result.allowed:
                return JsonResponse({"error": "Rate limit exceeded"}, status=429)
            return view_func(request, *args, **kwargs)
        return _wrapped_view
    return decorator