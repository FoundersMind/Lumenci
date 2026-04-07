"""
Fetch public web pages and extract plain text for RAG-style product-doc context.
Guards against basic SSRF (private IPs, non-http schemes).
"""

from __future__ import annotations

import ipaddress
import re
import socket
from typing import Optional, Tuple
from urllib.parse import urlunparse, urlparse

import requests
from bs4 import BeautifulSoup

_DEFAULT_UA = (
    "LumenciSpark/1.0 (+https://example.invalid; patent-analyst evidence capture; contact: support)"
)
_MAX_RESPONSE_BYTES = 2_000_000
_TIMEOUT = (5, 18)  # connect, read


class URLFetchError(Exception):
    pass


def _hostnameaddrs_safe(hostname: str) -> bool:
    hn = (hostname or "").strip().lower()
    if not hn or hn == "localhost":
        return False
    try:
        infos = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False
    if not infos:
        return False
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
        if ip.version == 6 and ip.ipv4_mapped:
            v4 = ip.ipv4_mapped
            if v4.is_private or v4.is_loopback:
                return False
    return True


def url_is_safe_to_fetch(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if not parsed.hostname:
        return False
    return _hostnameaddrs_safe(parsed.hostname)


def normalize_http_url(raw: str) -> str:
    u = (raw or "").strip()
    if not u:
        raise URLFetchError("URL is empty.")
    parsed = urlparse(u)
    if not parsed.scheme:
        u = "https://" + u.lstrip("/")
        parsed = urlparse(u)
    if parsed.scheme not in ("http", "https"):
        raise URLFetchError("Only http and https URLs are allowed.")
    if not parsed.hostname:
        raise URLFetchError("Invalid URL (no host).")
    host = parsed.hostname
    port = f":{parsed.port}" if parsed.port else ""
    netloc = f"{host}{port}"
    path = parsed.path if parsed.path else "/"
    return urlunparse((parsed.scheme, netloc, path, "", parsed.query, ""))


def _visible_text_from_html(html: str) -> Tuple[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    else:
        title = ""
    for tag in soup(["script", "style", "noscript", "template", "iframe"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [ln.strip() for ln in text.splitlines()]
    collapsed = "\n".join(ln for ln in lines if ln)
    collapsed = re.sub(r"\n{3,}", "\n\n", collapsed).strip()
    return title, collapsed


def fetch_page_text(url: str) -> Tuple[str, str, str]:
    """
    Returns (canonical_url, page_title_or_empty, plain_text).
    """
    canonical = normalize_http_url(url)
    if not url_is_safe_to_fetch(canonical):
        raise URLFetchError(
            "URL is not allowed (use a public http(s) address; private or localhost hosts are blocked)."
        )
    headers = {"User-Agent": _DEFAULT_UA, "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"}
    try:
        with requests.get(
            canonical,
            headers=headers,
            timeout=_TIMEOUT,
            stream=True,
            allow_redirects=True,
        ) as resp:
            if not url_is_safe_to_fetch(resp.url):
                raise URLFetchError("Redirect led to a disallowed URL.")
            if resp.status_code >= 400:
                raise URLFetchError(f"HTTP {resp.status_code}")
            ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            final_url = resp.url
            encoding = resp.encoding or "utf-8"
            buf = bytearray()
            for chunk in resp.iter_content(chunk_size=65536):
                if not chunk:
                    continue
                buf.extend(chunk)
                if len(buf) > _MAX_RESPONSE_BYTES:
                    raise URLFetchError(f"Page is too large (max {_MAX_RESPONSE_BYTES // 1_000_000} MB).")
            raw = bytes(buf)
    except URLFetchError:
        raise
    except requests.RequestException as e:
        raise URLFetchError(f"Download failed: {e}") from e
    try:
        html = raw.decode(encoding, errors="replace")
    except Exception:
        html = raw.decode("utf-8", errors="replace")

    if "html" in ctype or raw.strip().startswith(b"<") or "<html" in html[:2000].lower():
        title, text = _visible_text_from_html(html)
        if title and text:
            text = f"{title}\n\n{text}"
        elif title and not text:
            text = title
        return final_url, title, text

    if ctype.startswith("text/") or not ctype:
        text = html.strip()
        return final_url, "", text

    raise URLFetchError(
        f"Unsupported content type: {ctype or 'unknown'} — try a web page (HTML) or paste text into chat."
    )
