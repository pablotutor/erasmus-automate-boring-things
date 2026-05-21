import httpx
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "de-AT,de;q=0.9",
}

SUPERMARKET_URLS = {
    "billa": "https://shop.billa.at/aktionen",
    "hofer": "https://www.hofer.at/de/angebote/aktionen.html",
}


def _extract_products(html: str) -> list[str]:
    """Extrae nombres de productos de h3 tags."""
    soup = BeautifulSoup(html, "html.parser")
    names = []
    for tag in soup.find_all("h3"):
        text = tag.get_text(separator=" ", strip=True)
        if text and len(text) > 2:
            names.append(text)
    return list(dict.fromkeys(names))


def scrape(supermarket: str) -> str:
    """
    Scraping de ofertas para billa u hofer.
    Devuelve el texto raw (lista de productos) para guardar en weekly_deals.
    Lanza excepción si falla.
    """
    url = SUPERMARKET_URLS[supermarket]
    with httpx.Client(headers=HEADERS, timeout=15, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()
        products = _extract_products(response.text)

    if not products:
        raise ValueError(f"No se encontraron productos en {supermarket}. El HTML puede haber cambiado.")

    return "\n".join(products)
