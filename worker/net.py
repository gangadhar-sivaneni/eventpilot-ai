"""The only way the worker touches the internet: allowlisted hosts, public IPs only, checked redirects,
timeouts, bounded retries, robots.txt, and a polite per-host delay."""
import ipaddress
import socket
import time
import urllib.robotparser
from functools import cache
from urllib.parse import urljoin, urlsplit

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

USER_AGENT = "Mozilla/5.0 (compatible; EventPilotBot/0.1; +https://github.com/)"
TIMEOUT = 30
MAX_REDIRECTS = 5
MIN_INTERVAL = 1.0  # seconds between requests to one host

_last_hit: dict[str, float] = {}


class Blocked(Exception):
    """Request refused by our own safety rules (not a network error)."""


@cache
def _session() -> requests.Session:
    s = requests.Session()
    retry = Retry(total=3, backoff_factor=1.5, status_forcelist=[429, 500, 502, 503, 504],
                  allowed_methods=["GET", "POST"], respect_retry_after_header=True)
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.mount("http://", HTTPAdapter(max_retries=retry))
    s.headers["User-Agent"] = USER_AGENT
    return s


def host_allowed(host: str, allowed_hosts: set[str]) -> bool:
    return any(host == h or host.endswith("." + h) for h in allowed_hosts)


def is_public(host: str) -> bool:
    # ponytail: resolve-then-request leaves a DNS-rebinding window; pin the IP per request if hosts become user-supplied
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    return all(ipaddress.ip_address(info[4][0]).is_global for info in infos)


def check_url(url: str, allowed_hosts: set[str]) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise Blocked(f"not an http(s) URL: {url}")
    if not host_allowed(parts.hostname.lower(), allowed_hosts):
        raise Blocked(f"host not in source allowlist: {parts.hostname}")
    if not is_public(parts.hostname):
        raise Blocked(f"host resolves to a private or local address: {parts.hostname}")


@cache
def _robots(origin: str) -> urllib.robotparser.RobotFileParser:
    rp = urllib.robotparser.RobotFileParser()
    try:
        resp = _session().get(origin + "/robots.txt", timeout=TIMEOUT, allow_redirects=True)
        rp.parse(resp.text.splitlines() if resp.status_code == 200 else [])
    except requests.RequestException:
        rp.parse([])  # unreachable robots.txt = no rules published
    return rp


def fetch(url: str, allowed_hosts: set[str], *, json_body=None) -> requests.Response:
    """GET (or POST when json_body is given) with every safety rule applied. Raises on HTTP errors."""
    for _ in range(MAX_REDIRECTS + 1):
        check_url(url, allowed_hosts)
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if not _robots(origin).can_fetch(USER_AGENT, url):
            raise Blocked(f"robots.txt disallows {url}")
        wait = MIN_INTERVAL - (time.monotonic() - _last_hit.get(parts.hostname, 0))
        if wait > 0:
            time.sleep(wait)
        _last_hit[parts.hostname] = time.monotonic()
        method = "POST" if json_body is not None else "GET"
        resp = _session().request(method, url, json=json_body, timeout=TIMEOUT, allow_redirects=False)
        if resp.is_redirect:
            url = urljoin(url, resp.headers["Location"])  # re-validated at the top of the loop
            continue
        resp.raise_for_status()
        return resp
    raise Blocked(f"too many redirects: {url}")
