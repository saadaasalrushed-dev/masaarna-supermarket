(function () {
  const MIN_ORDER_AED = 1;

  const form = document.getElementById('checkout-form');
  const err = document.getElementById('checkout-error');
  const linesEl = document.getElementById('checkout-lines');
  const subEl = document.getElementById('checkout-subtotal');
  const totalEl = document.getElementById('checkout-total');
  const submitBtn = document.getElementById('checkout-submit');
  const payCardBtn = document.getElementById('checkout-pay-card');

  const params = new URLSearchParams(window.location.search);
  if (params.get('error') === 'payment_failed' && err) {
    err.textContent = 'Card payment was not completed. You can try again or choose cash on delivery.';
  }

  function money(n) {
    return `AED ${Number(n).toFixed(2)}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildOrderBody() {
    const promo = form.promoCode && form.promoCode.value.trim() === 'MASAARNA10';
    const clientSubtotal = window.MasaarnaCart.clientSubtotalFromCart();
    const discount = promo ? Math.round(clientSubtotal * 0.1 * 100) / 100 : 0;
    const totalPreview = Math.round((clientSubtotal - discount) * 100) / 100;
    const promoCode = form.promoCode && form.promoCode.value.trim() ? form.promoCode.value.trim() : undefined;
    return {
      items: window.MasaarnaCart.itemsForOrder(),
      clientSubtotal,
      promoCode,
      totalPreview,
      customer: {
        firstName: form.firstName.value.trim(),
        lastName: form.lastName.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim()
      },
      deliveryAddress: {
        line1: form.line1.value.trim(),
        city: form.city.value.trim(),
        emirate: form.emirate.value.trim(),
        notes: form.notes.value.trim()
      }
    };
  }

  async function render() {
    await window.MasaarnaCart.refreshPricesFromServer();
    const lines = window.MasaarnaCart.getCart();
    linesEl.innerHTML = '';
    if (!lines.length) {
      linesEl.innerHTML = '<p class="empty">Your cart is empty. <a href="/">Continue shopping</a></p>';
      form.style.display = 'none';
      return;
    }
    form.style.display = '';
    lines.forEach((l) => {
      const row = document.createElement('div');
      row.className = 'checkout-line';
      row.innerHTML = `<span><strong>${escapeHtml(l.name)}</strong> <span class="muted">× ${l.qty}</span></span><span>${money(
        l.qty * l.price
      )}</span>`;
      linesEl.appendChild(row);
    });
    const sub = window.MasaarnaCart.clientSubtotalFromCart();
    const promo = form.promoCode && form.promoCode.value.trim() === 'MASAARNA10';
    const discount = promo ? Math.round(sub * 0.1 * 100) / 100 : 0;
    const total = Math.round((sub - discount) * 100) / 100;
    subEl.textContent = money(sub);
    totalEl.textContent = money(total);
    if (submitBtn) {
      const canPay = lines.length > 0 && total >= MIN_ORDER_AED;
      submitBtn.disabled = !canPay;
    }
    if (payCardBtn) {
      payCardBtn.disabled = !lines.length || total < MIN_ORDER_AED;
    }
  }

  if (form && form.promoCode) {
    form.promoCode.addEventListener('input', render);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    await window.MasaarnaCart.refreshPricesFromServer();
    const items = window.MasaarnaCart.itemsForOrder();
    if (!items.length) {
      err.textContent = 'Cart is empty.';
      return;
    }
    const clientSubtotal = window.MasaarnaCart.clientSubtotalFromCart();
    const promo = form.promoCode && form.promoCode.value.trim() === 'MASAARNA10';
    const discount = promo ? Math.round(clientSubtotal * 0.1 * 100) / 100 : 0;
    const totalPreview = Math.round((clientSubtotal - discount) * 100) / 100;
    if (totalPreview < MIN_ORDER_AED) {
      err.textContent = `Minimum order is ${money(MIN_ORDER_AED)} (after discounts).`;
      return;
    }
    const promoCode = form.promoCode && form.promoCode.value.trim() ? form.promoCode.value.trim() : undefined;
    const body = {
      items,
      clientSubtotal,
      promoCode,
      customer: {
        firstName: form.firstName.value.trim(),
        lastName: form.lastName.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim()
      },
      deliveryAddress: {
        line1: form.line1.value.trim(),
        city: form.city.value.trim(),
        emirate: form.emirate.value.trim(),
        notes: form.notes.value.trim()
      }
    };
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        err.textContent = data.error || 'Order failed';
        if (data.serverSubtotal != null) {
          err.textContent += ` (server subtotal ${money(data.serverSubtotal)})`;
        }
        return;
      }
      window.MasaarnaCart.clear();
      window.location.href = `/order-confirmation.html?order=${encodeURIComponent(data.orderNumber)}`;
    } catch (ex) {
      err.textContent = ex.message || 'Network error';
    }
  });

  if (payCardBtn) {
    payCardBtn.addEventListener('click', async () => {
      err.textContent = '';
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      await window.MasaarnaCart.refreshPricesFromServer();
      const body = buildOrderBody();
      if (!body.items.length) {
        err.textContent = 'Cart is empty.';
        return;
      }
      if (body.totalPreview < MIN_ORDER_AED) {
        err.textContent = `Minimum order is ${money(MIN_ORDER_AED)} (after discounts).`;
        return;
      }
      payCardBtn.disabled = true;
      try {
        const res = await fetch('/api/payment/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) {
          err.textContent = data.error || 'Could not start card payment';
          if (data.hint) err.textContent += ' ' + data.hint;
          payCardBtn.disabled = false;
          return;
        }
        if (data.paymentUrl) {
          window.location.href = data.paymentUrl;
        } else {
          err.textContent = 'No payment URL returned.';
          payCardBtn.disabled = false;
        }
      } catch (ex) {
        err.textContent = ex.message || 'Network error';
        payCardBtn.disabled = false;
      }
    });
  }

  render();
})();
