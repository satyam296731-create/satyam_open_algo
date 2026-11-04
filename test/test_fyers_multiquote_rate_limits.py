from collections import deque
from threading import Lock
from types import SimpleNamespace

import pytest

from utils.broker_backpressure import BrokerBusyError


def test_large_multiquote_skips_per_symbol_depth_requests(monkeypatch):
    from broker.fyers.api import data

    broker = data.BrokerData("token")
    batches = []
    monkeypatch.setattr(data.time, "sleep", lambda _seconds: None)
    monkeypatch.setattr(
        broker,
        "_process_quotes_batch",
        lambda symbols, fetch_oi: batches.append((len(symbols), fetch_oi)) or [],
    )

    broker.get_multiquotes([{"symbol": f"OPT{i}", "exchange": "NFO"} for i in range(51)])

    assert batches == [(50, False), (1, False)]


def test_small_multiquote_keeps_open_interest_fetch(monkeypatch):
    from broker.fyers.api import data

    broker = data.BrokerData("token")
    batches = []
    monkeypatch.setattr(
        broker,
        "_process_quotes_batch",
        lambda symbols, fetch_oi: batches.append((len(symbols), fetch_oi)) or [],
    )

    broker.get_multiquotes([{"symbol": f"OPT{i}", "exchange": "NFO"} for i in range(10)])

    assert batches == [(10, True)]


def test_fyers_pacer_respects_rolling_minute_cap(monkeypatch):
    from broker.fyers.api import rate_limiter

    clock = {"now": 1_000.0}
    fake_time = SimpleNamespace(
        time=lambda: clock["now"],
        sleep=lambda seconds: clock.__setitem__("now", clock["now"] + seconds),
    )
    monkeypatch.setattr(rate_limiter, "time", fake_time)
    monkeypatch.setattr(rate_limiter, "_lock", Lock())
    monkeypatch.setattr(rate_limiter, "_last_call_time", clock["now"] - 1)
    monkeypatch.setattr(rate_limiter, "_cooldown_until", 0.0)
    monkeypatch.setattr(
        rate_limiter,
        "_reserved_call_times",
        deque(maxlen=rate_limiter.MAX_CALLS_PER_MINUTE),
    )

    call_times = []
    for _ in range(rate_limiter.MAX_CALLS_PER_MINUTE * 2):
        rate_limiter.apply_rate_limit()
        call_times.append(rate_limiter._last_call_time)

    assert len(rate_limiter._reserved_call_times) <= rate_limiter.MAX_CALLS_PER_MINUTE
    assert call_times[rate_limiter.MAX_CALLS_PER_MINUTE] >= (
        call_times[0] + rate_limiter.WINDOW_SECONDS
    )
    for end, call_time in enumerate(call_times):
        in_window = sum(
            call_time - rate_limiter.WINDOW_SECONDS < t <= call_time for t in call_times[: end + 1]
        )
        assert in_window <= rate_limiter.MAX_CALLS_PER_MINUTE


def test_fyers_429_cools_down_all_api_callers(monkeypatch):
    from broker.fyers.api import rate_limiter

    clock = {"now": 1_000.0}

    def sleep(seconds):
        clock["now"] += seconds
        if not clock.get("limited"):
            clock["limited"] = True
            assert rate_limiter.defer_after_rate_limit({"Retry-After": "2"}, 0) == 2.0

    monkeypatch.setattr(
        rate_limiter,
        "time",
        SimpleNamespace(
            time=lambda: clock["now"],
            sleep=sleep,
        ),
    )
    monkeypatch.setattr(rate_limiter, "_lock", Lock())
    monkeypatch.setattr(rate_limiter, "_last_call_time", clock["now"])
    monkeypatch.setattr(rate_limiter, "_cooldown_until", 0.0)
    monkeypatch.setattr(
        rate_limiter,
        "_reserved_call_times",
        deque(maxlen=rate_limiter.MAX_CALLS_PER_MINUTE),
    )

    rate_limiter.apply_rate_limit()

    assert clock["now"] >= 1_002.25
    assert rate_limiter._last_call_time >= 1_002.25


def test_fyers_history_429_registers_shared_cooldown(monkeypatch):
    import httpx

    from broker.fyers.api import data

    request = httpx.Request("GET", "https://api-t1.fyers.in/data/history")
    responses = iter(
        [
            httpx.Response(429, headers={"Retry-After": "1"}, request=request),
            httpx.Response(200, json={"s": "ok"}, request=request),
        ]
    )
    delays = []
    monkeypatch.setattr(
        data,
        "get_httpx_client",
        lambda: SimpleNamespace(get=lambda *_args, **_kwargs: next(responses)),
    )
    monkeypatch.setattr(data, "apply_rate_limit", lambda: None)
    monkeypatch.setattr(
        data,
        "defer_after_rate_limit",
        lambda headers, attempt: delays.append((headers, attempt)) or 1.0,
    )
    monkeypatch.setattr(data, "time", SimpleNamespace(sleep=lambda _seconds: None))

    result = data.get_api_response("/data/history", "token")

    assert result == {"s": "ok"}
    assert len(delays) == 1
    assert delays[0][0]["Retry-After"] == "1"
    assert delays[0][1] == 0


def test_direct_order_calls_propagate_pacer_refusals(monkeypatch):
    from broker.fyers.api import order_api

    busy = BrokerBusyError("Fyers request queue is busy.")

    def refuse(*_args):
        raise busy

    monkeypatch.setattr(order_api, "get_httpx_client", lambda: object())
    monkeypatch.setattr(order_api, "transform_data", lambda _data: {})
    monkeypatch.setattr(order_api, "transform_modify_order_data", lambda _data: {})
    monkeypatch.setattr(order_api, "apply_rate_limit", refuse)

    calls = [
        (order_api.place_order_api, ({}, "token")),
        (order_api.close_all_positions, ("key", "token")),
        (order_api.cancel_order, ("order-id", "token")),
        (order_api.modify_order, ({}, "token")),
    ]
    for call, args in calls:
        with pytest.raises(BrokerBusyError) as raised:
            call(*args)
        assert raised.value is busy


def test_funds_and_margin_calls_propagate_pacer_refusals(monkeypatch):
    from broker.fyers.api import funds, margin_api

    busy = BrokerBusyError("Fyers request queue is busy.")
    monkeypatch.setenv("BROKER_API_KEY", "key")
    monkeypatch.setattr(funds, "get_httpx_client", lambda: object())
    monkeypatch.setattr(funds, "_cache", {})
    monkeypatch.setattr(funds, "_rate_limit", {})

    def refuse():
        raise busy

    monkeypatch.setattr(funds, "apply_rate_limit", refuse)

    with pytest.raises(BrokerBusyError) as raised:
        funds.get_margin_data("token")
    assert raised.value is busy

    monkeypatch.setattr(margin_api, "get_httpx_client", lambda: object())
    monkeypatch.setattr(margin_api, "transform_margin_positions", lambda _positions: ["valid"])
    monkeypatch.setattr(margin_api, "apply_rate_limit", refuse)

    with pytest.raises(BrokerBusyError) as raised:
        margin_api.calculate_margin_api([{}], "token")
    assert raised.value is busy
