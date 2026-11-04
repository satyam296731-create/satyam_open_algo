import pytest

import broker.groww.api.funds as funds
from utils.broker_backpressure import BrokerBusyError


class Response:
    status_code = 200

    def json(self):
        return {
            "status": "SUCCESS",
            "payload": {
                "clear_cash": 1000,
                "collateral_available": 200,
                "net_margin_used": 300,
            },
        }


def test_funds_request_uses_the_broker_access_token(monkeypatch):
    captured = {}
    monkeypatch.setattr(funds, "get_httpx_client", lambda: object())

    def request(client, method, url, category, **kwargs):
        captured.update(method=method, url=url, category=category, **kwargs)
        return Response()

    monkeypatch.setattr(funds, "groww_request", request)
    monkeypatch.setattr(funds, "_day_m2m", lambda _token: (12.5, -4.25))

    result = funds.get_margin_data("groww-access-token")

    authorization = captured["headers"]["Authorization"]
    assert authorization.startswith("Bearer ")
    assert authorization.endswith("groww-access-token")
    assert result == {
        "availablecash": "1000.00",
        "collateral": "200.00",
        "m2mrealized": "12.50",
        "m2munrealized": "-4.25",
        "utiliseddebits": "300.00",
    }


def test_funds_request_propagates_broker_backpressure(monkeypatch):
    monkeypatch.setattr(funds, "get_httpx_client", lambda: object())
    monkeypatch.setattr(
        funds,
        "groww_request",
        lambda *args, **kwargs: (_ for _ in ()).throw(BrokerBusyError()),
    )

    with pytest.raises(BrokerBusyError):
        funds.get_margin_data("groww-access-token")
