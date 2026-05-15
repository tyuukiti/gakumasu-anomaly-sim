"""ネットワークアクセス (gakumasu_tool/scripts/wiki_sync/network.py と同等)"""
import urllib.request


def fetch_page(url: str) -> str:
    """Wikiページを取得してHTMLを返す。seesaawiki は EUC-JP。"""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    resp = urllib.request.urlopen(req)
    return resp.read().decode("euc-jp", errors="replace")
