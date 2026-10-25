import pytest
from unittest.mock import MagicMock, Mock

import net


@pytest.mark.parametrize("url", [
    "http://localhost/admin",
    "http://127.0.0.1:8080/",
    "http://169.254.169.254/latest/meta-data",  # cloud metadata endpoint
    "http://10.0.0.5/",
    "file:///etc/passwd",
    "https://evil.example.org/",  # not on the allowlist
])
def test_ssrf_guard_blocks(url):
    allowed = {"localhost", "127.0.0.1", "169.254.169.254", "10.0.0.5", "devpost.com"}
    with pytest.raises(net.Blocked):
        net.check_url(url, allowed)


def test_allowlist_accepts_subdomains_only_of_listed_hosts():
    assert net.host_allowed("api.devfolio.co", {"devfolio.co"})
    assert not net.host_allowed("devfolio.co.evil.com", {"devfolio.co"})
    assert not net.host_allowed("notdevpost.com", {"devpost.com"})


def test_public_link_checks_success_and_revalidates_redirect(monkeypatch):
    monkeypatch.setattr(net, "is_public", lambda _host: True)
    monkeypatch.setattr(net, "_robots", lambda _origin: Mock(can_fetch=lambda *_: True))
    monkeypatch.setattr(net, "_last_hit", {})
    session = Mock()
    redirect = MagicMock(is_redirect=True, headers={"Location": "https://signup.example.org/form"})
    success = MagicMock(is_redirect=False, status_code=200, url="https://signup.example.org/form")
    redirect.__enter__.return_value = redirect
    success.__enter__.return_value = success
    session.get.side_effect = [redirect, success]
    monkeypatch.setattr(net, "_session", lambda: session)
    monkeypatch.setattr(net.time, "sleep", lambda _delay: None)
    assert net.verify_public_link("https://events.example.org/item") == "https://signup.example.org/form"
    assert session.get.call_count == 2


def test_public_link_rejects_private_redirect_and_unsupported_port(monkeypatch):
    monkeypatch.setattr(net, "is_public", lambda host: host != "127.0.0.1")
    monkeypatch.setattr(net, "_robots", lambda _origin: Mock(can_fetch=lambda *_: True))
    monkeypatch.setattr(net, "_last_hit", {})
    redirect = MagicMock(is_redirect=True, headers={"Location": "http://127.0.0.1/admin"})
    redirect.__enter__.return_value = redirect
    session = Mock(get=Mock(return_value=redirect))
    monkeypatch.setattr(net, "_session", lambda: session)
    monkeypatch.setattr(net.time, "sleep", lambda _delay: None)
    with pytest.raises(net.Blocked):
        net.verify_public_link("https://events.example.org/item")
    with pytest.raises(net.Blocked):
        net.verify_public_link("https://events.example.org:8443/item")
