"""Rate limiting (slowapi).

Глобальный лимит запросов на IP против перебора (логин/токены) и злоупотреблений
API. Лимитер регистрируется в app.state и применяется ко всем маршрутам через
SlowAPIMiddleware (см. app/main.py). Хранилище — in-memory, поэтому корректно
работает на одном инстансе (для нескольких нужен общий backend, напр. Redis).
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _client_key(request: Request) -> str:
    # За прокси (Render/Vercel) реальный IP клиента — в X-Forwarded-For,
    # иначе все запросы пришли бы с одного IP прокси и делили общий лимит.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# Базовый лимит на все маршруты. Точечно строже можно навесить @limiter.limit.
limiter = Limiter(key_func=_client_key, default_limits=["120/minute"])
