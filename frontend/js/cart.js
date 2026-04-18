(function (global) {
  const KEY = 'masaarna_cart_v1';

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function write(lines) {
    localStorage.setItem(KEY, JSON.stringify(lines));
    window.dispatchEvent(new CustomEvent('masaarna-cart'));
  }

  function normalizeLine(p) {
    const id = parseInt(p.id, 10);
    const qty = Math.max(1, parseInt(p.qty, 10) || 1);
    const price = Number(p.price);
    return {
      id,
      qty,
      name: p.name || 'Product',
      price: Number.isFinite(price) ? price : 0,
      image: p.image || null
    };
  }

  function getCart() {
    return read().map(normalizeLine);
  }

  function saveCart(lines) {
    write(lines.map(normalizeLine));
  }

  function addItem(product, qty) {
    const q = Math.max(1, parseInt(qty, 10) || 1);
    const lines = getCart();
    const idx = lines.findIndex((l) => l.id === product.id);
    if (idx >= 0) lines[idx].qty += q;
    else {
      let image = null;
      if (product.images && product.images[0]) image = product.images[0];
      lines.push(
        normalizeLine({
          id: product.id,
          qty: q,
          name: product.name,
          price: product.price,
          image
        })
      );
    }
    saveCart(lines);
  }

  function setQty(id, qty) {
    const lines = getCart();
    const i = lines.findIndex((l) => l.id === id);
    if (i < 0) return;
    if (qty < 1) lines.splice(i, 1);
    else lines[i].qty = qty;
    saveCart(lines);
  }

  function removeItem(id) {
    saveCart(getCart().filter((l) => l.id !== id));
  }

  function clear() {
    write([]);
  }

  function itemsForOrder() {
    return getCart().map((l) => ({ id: l.id, qty: l.qty }));
  }

  function clientSubtotalFromCart() {
    return Math.round(getCart().reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
  }

  /**
   * Refresh line prices from GET /api/products (same catalog as server).
   */
  async function refreshPricesFromServer() {
    const res = await fetch('/api/products?limit=500');
    const data = await res.json();
    if (!data.products) return;
    const byId = new Map(data.products.map((p) => [p.id, p]));
    const lines = getCart().map((l) => {
      const p = byId.get(l.id);
      if (!p) return l;
      let image = l.image;
      if (p.images && p.images[0]) image = p.images[0];
      return normalizeLine({ ...l, price: p.price, name: p.name, image });
    });
    saveCart(lines);
  }

  global.MasaarnaCart = {
    getCart,
    saveCart,
    addItem,
    setQty,
    removeItem,
    clear,
    itemsForOrder,
    clientSubtotalFromCart,
    refreshPricesFromServer
  };
})(typeof window !== 'undefined' ? window : globalThis);
