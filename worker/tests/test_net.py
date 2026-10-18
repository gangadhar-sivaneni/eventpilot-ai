import pytest

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
