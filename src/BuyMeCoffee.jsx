const SUPPORT_URL = "https://YOUR-SUPPORT-LINK.com";

export function BuyMeCoffee() {
  return (
    <a
      className="buy-me-coffee"
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buy Me a Coffee"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8h14v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" />
        <path d="M18 10h1a3 3 0 1 1 0 6h-2" />
        <path d="M8 3c0 2 2 2 2 4M13 3c0 2 2 2 2 4" />
      </svg>
      <span>Buy Me a Coffee</span>
    </a>
  );
}
