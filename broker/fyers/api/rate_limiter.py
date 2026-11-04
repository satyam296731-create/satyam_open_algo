"""
Shared rate limiting and 429-retry helpers for all Fyers API calls.

Fyers enforces a single global cap per API key across every REST endpoint --
order, data, quotes, depth, history, funds: 10 requests/second, 200/minute,
100000/day (see fyers-api-docs/FYERS_API_v3.md -> "Rate Limits"). Unlike Dhan,
which has independent per-endpoint-class limits (charts vs marketfeed), Fyers'
10 req/sec budget is shared process-wide, so pacing state MUST live in one
place that every module importing it sees -- not per BrokerData instance.

Services create a fresh BrokerData(auth_token) per request (see
services/option_chain_service.py, services/oi_tracker_service.py, etc.), so
any rate-limit state kept on `self` is reset away on every call and never
actually paces anything against concurrent requests. That was the root cause
of option-chain/depth bursts (many individual /data/depth calls for OI)
routinely exceeding the real 10 req/sec cap and getting HTTP 429'd.
"""

import threading
import time
from collections import deque

from utils.broker_backpressure import BrokerBusyError, cap_server_delay, check_queue_wait

_lock = threading.Lock()
_last_call_time = 0.0
_cooldown_until = 0.0
MAX_CALLS_PER_MINUTE = 150
WINDOW_SECONDS = 60.0
_reserved_call_times: deque[float] = deque(maxlen=MAX_CALLS_PER_MINUTE)

# Fyers shares its limits across endpoints; keep a wider margin for bursts and
# requests made by other clients using the same API key.
MIN_INTERVAL = 0.25
WINDOW_HEADROOM_SECONDS = 0.01

MAX_RETRIES = 3
BASE_BACKOFF = 1.0  # seconds; exponential fallback when no Retry-After header: 1, 2, 4


def apply_rate_limit(kind="data"):
    """Block the calling thread until it is safe to make another Fyers API call.

    Shared process-wide (module-level lock + timestamp) so every caller
    across broker.fyers.api paces against the same clock, regardless of how
    many separate BrokerData/order_api calls are in flight at once.

    Every caller books a slot against both Fyers' per-second and rolling
    per-minute limits. Under the gthread worker a caller whose slot is further
    away than ``utils.broker_backpressure.max_queue_wait(kind)`` is refused
    before it books anything. Under eventlet and the dev server there is no
    wait bound.

    Args:
        kind: ``"data"``, or ``"order"`` for order placement and changes.

    Raises:
        BrokerBusyError: Under gthread, when the slot is too far away.
    """
    global _last_call_time
    while True:
        with _lock:
            now = time.time()
            while _reserved_call_times and _reserved_call_times[0] <= now - WINDOW_SECONDS:
                _reserved_call_times.popleft()

            next_call_time = max(now, _last_call_time + MIN_INTERVAL, _cooldown_until)
            if len(_reserved_call_times) == MAX_CALLS_PER_MINUTE:
                next_call_time = max(
                    next_call_time,
                    _reserved_call_times[0] + WINDOW_SECONDS + WINDOW_HEADROOM_SECONDS,
                )

            check_queue_wait(next_call_time - now, kind)
            _last_call_time = next_call_time
            _reserved_call_times.append(next_call_time)

        if next_call_time > now:
            time.sleep(next_call_time - now)

        with _lock:
            if next_call_time >= _cooldown_until:
                return
            if next_call_time in _reserved_call_times:
                _reserved_call_times.remove(next_call_time)


def retry_delay_from_headers(headers, attempt, kind="data"):
    """Compute how long to wait before retrying a 429.

    Fyers documents both `Retry-After` (seconds) and `X-Retry-After-Ms`
    (milliseconds) response headers on rate-limited requests -- prefer those
    over a blind exponential guess when present.

    The broker's delay is honoured as asked, except under the gthread worker
    when it is longer than ``max_queue_wait(kind)``: sleeping it there would
    hold a request thread for as long as the broker likes (three retries of a
    60 second Retry-After is three minutes), so the retry is abandoned instead.

    Raises:
        BrokerBusyError: Under gthread, when the broker asks for a longer wait
            than the bound.
    """
    delay = _requested_delay(headers, attempt)
    if cap_server_delay(delay, kind) is None:
        raise BrokerBusyError(
            "Fyers asked OpenAlgo to slow down and wait longer than a request "
            "can be held. This request was not retried. Try again in a minute.",
            retry_after=delay,
        )
    return delay


def defer_after_rate_limit(headers, attempt, kind="data"):
    """Apply a broker-requested cooldown to every Fyers API caller."""
    global _cooldown_until
    delay = retry_delay_from_headers(headers, attempt, kind)
    with _lock:
        _cooldown_until = max(_cooldown_until, time.time() + delay)
    return delay


def _requested_delay(headers, attempt):
    retry_after_ms = headers.get("X-Retry-After-Ms") or headers.get("x-retry-after-ms")
    if retry_after_ms:
        try:
            return max(float(retry_after_ms) / 1000.0, 0.05)
        except ValueError:
            pass

    retry_after = headers.get("Retry-After") or headers.get("retry-after")
    if retry_after:
        try:
            return max(float(retry_after), 0.05)
        except ValueError:
            pass

    return BASE_BACKOFF * (2**attempt)
