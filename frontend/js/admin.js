(function () {
  const TOKEN_KEY = 'masaarna_admin_jwt';
  const API_BASE_STORAGE = 'masaarna_api_base';

  const loginBox = document.getElementById('login-box');
  const dashBox = document.getElementById('dash-box');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const statsEl = document.getElementById('stats');
  const dashError = document.getElementById('dash-error');
  const adminUser = document.getElementById('admin-user');
  const logoutBtn = document.getElementById('logout-btn');
  const ordersWrap = document.getElementById('orders-wrap');
  const ordersMsg = document.getElementById('orders-msg');
  const productsWrap = document.getElementById('products-wrap');
  const productsMsg = document.getElementById('products-msg');
  const productFilter = document.getElementById('product-filter');
  const categoriesWrap = document.getElementById('categories-wrap');
  const categoriesMsg = document.getElementById('categories-msg');
  const bannersWrap = document.getElementById('banners-wrap');
  const bannersMsg = document.getElementById('banners-msg');
  const productModal = document.getElementById('product-modal');
  const productForm = document.getElementById('product-form');
  const btnNewProduct = document.getElementById('btn-new-product');

  let productsCache = [];
  /** Flat list of image URLs as stored in DB: [thumb, full, thumb, full, …]. */
  let productImagesEdit = [];

  /** Origin where Node serves /api (e.g. http://localhost:3000). Empty = same page origin. */
  function getApiOrigin() {
    const meta = document.querySelector('meta[name="api-base"]');
    const fromMeta = meta && meta.getAttribute('content');
    if (fromMeta && String(fromMeta).trim()) return String(fromMeta).trim().replace(/\/$/, '');
    const fromLs = localStorage.getItem(API_BASE_STORAGE);
    if (fromLs && fromLs.trim()) return fromLs.trim().replace(/\/$/, '');
    return '';
  }

  /** Prefix for all API calls: "/api" or "http://localhost:3000/api". */
  function apiRoot() {
    const o = getApiOrigin();
    return o ? o + '/api' : '/api';
  }

  /**
   * If the admin HTML is served from another port (e.g. Live Server on 3003) but Node runs on 3000,
   * same-origin /api returns 404. Scan localhost ports for GET /api/health and save the origin.
   */
  async function isMasaarnaHealth(res) {
    if (!res.ok) return false;
    try {
      const j = await res.json();
      return j && j.status === 'ok' && String(j.service || '').includes('Masaarna');
    } catch {
      return false;
    }
  }

  async function probeLocalApiOrigin() {
    if (getApiOrigin()) return;
    const h = window.location.hostname;
    if (h !== 'localhost' && h !== '127.0.0.1') return;
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      if (await isMasaarnaHealth(r)) return;
    } catch {
      /* no server on this origin */
    }
    const cur = window.location.port || '';
    for (let p = 3000; p <= 3015; p++) {
      if (String(p) === cur) continue;
      const base = `http://${h}:${p}`;
      try {
        const r = await fetch(`${base}/api/health`, { cache: 'no-store', mode: 'cors' });
        if (await isMasaarnaHealth(r)) {
          localStorage.setItem(API_BASE_STORAGE, base);
          window.location.reload();
          return;
        }
      } catch {
        /* try next port */
      }
    }
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function api(path, opts) {
    const headers = { Accept: 'application/json', ...(opts && opts.headers) };
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    return fetch(apiRoot() + '/admin' + path, { ...opts, headers });
  }

  async function apiProducts(path, opts) {
    const headers = { Accept: 'application/json', ...(opts && opts.headers) };
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    if (opts && opts.body && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(apiRoot() + '/products' + path, { ...opts, headers });
  }

  async function apiOrdersStatus(orderNumber, status) {
    const t = token();
    return fetch(apiRoot() + '/orders/' + encodeURIComponent(orderNumber) + '/status', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + t
      },
      body: JSON.stringify({ status })
    });
  }

  async function apiUploadImage(file) {
    const fd = new FormData();
    fd.append('image', file);
    const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token() };
    return fetch(apiRoot() + '/upload/image', { method: 'POST', body: fd, headers });
  }

  function bannerImgSrc(u) {
    if (!u) return '';
    const s = String(u).trim();
    return s.startsWith('/') || /^https?:/i.test(s) ? s : '/' + s;
  }

  async function readError(res) {
    let base = '';
    try {
      const j = await res.json();
      base = j.error || j.message || res.statusText;
    } catch (e) {
      base = res.statusText || 'Request failed';
    }
    if (res.status === 404) {
      base +=
        ' — Set Backend URL to your Node server (Overview → Backend API connection), or open admin from the same port as `node server.js`.';
    }
    return base;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showLogin() {
    loginBox.style.display = '';
    dashBox.style.display = 'none';
    if (dashError) dashError.textContent = '';
  }

  function showDash() {
    loginBox.style.display = 'none';
    dashBox.style.display = '';
  }

  function initTabs() {
    const nav = document.getElementById('admin-nav');
    if (!nav) return;
    nav.querySelectorAll('button[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        nav.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
        document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
          panel.classList.toggle('is-visible', panel.id === 'tab-' + tab);
        });
        if (tab === 'orders') loadOrdersFull();
        if (tab === 'products') loadProductsTable();
        if (tab === 'categories') loadCategoriesTable();
        if (tab === 'banners') loadBannersTable();
        if (tab === 'storefront') loadSiteSettingsForm();
      });
    });
  }

  async function loadStats() {
    if (dashError) dashError.textContent = '';
    const res = await api('/cms/summary');
    if (res.status === 401) {
      setToken(null);
      showLogin();
      return;
    }
    if (!res.ok) {
      if (statsEl) statsEl.innerHTML = '';
      if (dashError) dashError.textContent = 'Stats: ' + (await readError(res));
      return;
    }
    const data = await res.json();
    if (statsEl) {
      statsEl.innerHTML = `
      <div class="stat"><strong>${data.productsActive ?? '—'}</strong><span class="muted">Active products</span></div>
      <div class="stat"><strong>${data.productsTotal ?? '—'}</strong><span class="muted">All SKUs</span></div>
      <div class="stat"><strong>${data.orders ?? '—'}</strong><span class="muted">Orders</span></div>
      <div class="stat"><strong>${data.lowStock ?? '—'}</strong><span class="muted">Low stock</span></div>
      <div class="stat"><strong>${data.banners ?? '—'}</strong><span class="muted">Active banners</span></div>`;
    }
  }

  async function loadSiteSettingsForm() {
    const form = document.getElementById('site-settings-form');
    if (!form) return;
    const res = await api('/settings');
    if (!res.ok) return;
    const data = await res.json();
    const rows = data.raw || data.settings || [];
    const map = {};
    rows.forEach((r) => {
      const k = r.key != null ? r.key : r.Key;
      if (k) map[k] = r.value != null ? r.value : r.Value;
    });
    form.querySelectorAll('[data-setting-key]').forEach((el) => {
      const k = el.getAttribute('data-setting-key');
      el.value = map[k] != null ? map[k] : '';
    });
  }

  const ORDER_STATUSES = [
    'pending',
    'pending_payment',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'refunded'
  ];

  async function loadOrdersFull() {
    if (!ordersWrap) return;
    ordersMsg.textContent = 'Loading…';
    const res = await api('/orders');
    if (res.status === 401) {
      ordersMsg.textContent = '';
      return;
    }
    if (!res.ok) {
      ordersMsg.textContent = await readError(res);
      return;
    }
    ordersMsg.textContent = '';
    const data = await res.json();
    const orders = data.orders || [];
    if (!orders.length) {
      ordersWrap.innerHTML = '<p class="muted" style="padding:1rem">No orders yet.</p>';
      return;
    }
    const rows = orders.map((o) => {
      const when = (o.created_at || '').replace('T', ' ').slice(0, 19);
      const opts = ORDER_STATUSES.map(
        (s) => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`
      ).join('');
      return `<tr data-order="${escapeHtml(o.order_number)}">
        <td><code>${escapeHtml(o.order_number)}</code></td>
        <td><select class="order-status" aria-label="Status">${opts}</select></td>
        <td>${escapeHtml(o.payment_method || '')}</td>
        <td>${escapeHtml(o.payment_status || '')}</td>
        <td><strong>AED ${Number(o.total).toFixed(2)}</strong></td>
        <td class="muted">${escapeHtml(when)}</td>
        <td><button type="button" class="btn btn--primary btn--sm btn-save-order">Save</button></td>
      </tr>`;
    });
    ordersWrap.innerHTML = `
      <table class="admin-table admin-table--wide" aria-label="Orders">
        <thead>
          <tr><th>Order</th><th>Status</th><th>Pay method</th><th>Pay status</th><th>Total</th><th>When</th><th></th></tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>`;
    ordersWrap.querySelectorAll('tr[data-order]').forEach((tr) => {
      const num = tr.getAttribute('data-order');
      tr.querySelector('.btn-save-order').addEventListener('click', async () => {
        const sel = tr.querySelector('.order-status');
        const st = sel.value;
        ordersMsg.textContent = 'Saving…';
        const r = await apiOrdersStatus(num, st);
        ordersMsg.textContent = r.ok ? 'Status updated.' : await readError(r);
        if (r.ok) setTimeout(() => (ordersMsg.textContent = ''), 2000);
      });
    });
  }

  function productThumb(images) {
    const u = Array.isArray(images) && images[0] ? images[0] : '';
    if (!u) return '';
    const src = u.startsWith('/') || /^https?:/i.test(u) ? u : '/' + u;
    return `<img class="thumb" src="${escapeHtml(src)}" alt="" width="44" height="44" loading="lazy" />`;
  }

  async function loadProductsTable() {
    if (!productsWrap) return;
    productsMsg.textContent = 'Loading…';
    const res = await api('/products');
    if (!res.ok) {
      productsMsg.textContent = await readError(res);
      return;
    }
    productsMsg.textContent = '';
    const data = await res.json();
    productsCache = data.products || [];
    renderProductsTable();
  }

  function renderProductsTable() {
    const q = (productFilter && productFilter.value.trim().toLowerCase()) || '';
    let list = productsCache;
    if (q) {
      list = productsCache.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.sku && String(p.sku).toLowerCase().includes(q))
      );
    }
    if (!list.length) {
      const empty =
        !productsCache.length && !q
          ? '<p class="muted" style="padding:1rem">No products in the database yet. Use <strong>Add product</strong>, or restart the server so the demo seed can run on an empty DB.</p>'
          : '<p class="muted" style="padding:1rem">No products match this filter.</p>';
      productsWrap.innerHTML = empty;
      return;
    }
    const rows = list.map((p) => {
      const imgs = p.images || [];
      return `<tr>
        <td>${productThumb(imgs)}</td>
        <td><code>${escapeHtml(p.sku)}</code></td>
        <td>${escapeHtml(p.name)}</td>
        <td><code>${escapeHtml(p.category)}</code></td>
        <td>AED ${Number(p.price).toFixed(2)}</td>
        <td>${p.stock}</td>
        <td>${p.is_active ? 'Yes' : 'No'}</td>
        <td>
          <button type="button" class="btn btn--ghost btn--sm" data-edit-product="${p.id}">Edit</button>
          <button type="button" class="btn btn--ghost btn--sm" data-hide-product="${p.id}">Hide</button>
        </td>
      </tr>`;
    });
    productsWrap.innerHTML = `
      <table class="admin-table admin-table--wide">
        <thead>
          <tr><th></th><th>SKU</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Active</th><th></th></tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>`;
    productsWrap.querySelectorAll('[data-edit-product]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void openProductModal(parseInt(btn.getAttribute('data-edit-product'), 10));
      });
    });
    productsWrap.querySelectorAll('[data-hide-product]').forEach((btn) => {
      btn.addEventListener('click', () => deactivateProduct(parseInt(btn.getAttribute('data-hide-product'), 10)));
    });
  }

  async function loadCategoriesForProductForm() {
    const sel = document.getElementById('pf-category');
    if (!sel || sel.tagName !== 'SELECT') return;
    const res = await api('/categories');
    if (!res.ok) {
      sel.innerHTML = '<option value="">— Could not load categories —</option>';
      return;
    }
    const data = await res.json();
    const categories = data.categories || [];
    const current = sel.value;
    sel.innerHTML =
      '<option value="">— Select category —</option>' +
      categories
        .map(
          (c) =>
            `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)} (${escapeHtml(c.slug)})</option>`
        )
        .join('');
    if (current && [...sel.options].some((o) => o.value === current)) sel.value = current;
  }

  function removeImagePair(idx) {
    const start = idx * 2;
    if (start >= productImagesEdit.length) return;
    const hasPair = start + 1 < productImagesEdit.length;
    productImagesEdit.splice(start, hasPair ? 2 : 1);
    renderProductImagesEdit();
  }

  function renderProductImagesEdit() {
    const wrap = document.getElementById('pf-images-current');
    if (!wrap) return;
    const flat = productImagesEdit;
    const pairCount = Math.ceil(flat.length / 2);
    if (!pairCount) {
      wrap.innerHTML = '<p class="muted" style="margin:0">No images yet. Add files below.</p>';
      return;
    }
    let html = '';
    for (let idx = 0; idx < pairCount; idx++) {
      const thumb = flat[idx * 2];
      const src = thumb && (thumb.startsWith('/') || /^https?:/i.test(thumb)) ? thumb : '/' + thumb;
      html += `<div class="pf-img-row">
        <img src="${escapeHtml(src)}" alt="" width="64" height="64" style="object-fit:cover;border-radius:4px" loading="lazy" />
        <button type="button" class="btn btn--ghost btn--sm" data-rm-img="${idx}">Remove</button>
      </div>`;
    }
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-rm-img]').forEach((btn) => {
      btn.addEventListener('click', () => removeImagePair(parseInt(btn.getAttribute('data-rm-img'), 10)));
    });
  }

  async function deactivateProduct(id) {
    if (!confirm('Hide this product from the storefront?')) return;
    const p = productsCache.find((x) => x.id === id);
    if (!p) return;
    const fd = new FormData();
    fd.append('name', p.name);
    fd.append('brand', p.brand || '');
    fd.append('description', p.description || '');
    fd.append('category', p.category);
    fd.append('price', String(p.price));
    fd.append('original_price', p.original_price != null ? String(p.original_price) : '');
    fd.append('stock', String(p.stock));
    fd.append('weight', p.weight || '');
    fd.append('origin', p.origin || '');
    fd.append('is_featured', p.is_featured ? '1' : '');
    fd.append('is_bestseller', p.is_bestseller ? '1' : '');
    fd.append('is_active', '0');
    productsMsg.textContent = 'Saving…';
    const res = await apiProducts('/' + id, { method: 'PUT', body: fd });
    productsMsg.textContent = res.ok ? 'Product hidden.' : await readError(res);
    await loadProductsTable();
    await loadStats();
  }

  async function openProductModal(id) {
    document.getElementById('product-form-msg').textContent = '';
    const title = document.getElementById('product-modal-title');
    const imagesInput = document.getElementById('pf-images');
    if (imagesInput) imagesInput.value = '';

    if (id) {
      await loadCategoriesForProductForm();
      title.textContent = 'Edit product';
      const p = productsCache.find((x) => x.id === id);
      if (!p) return;
      document.getElementById('pf-id').value = String(p.id);
      document.getElementById('pf-sku').value = p.sku;
      document.getElementById('pf-sku').readOnly = true;
      document.getElementById('pf-name').value = p.name || '';
      document.getElementById('pf-brand').value = p.brand || '';
      document.getElementById('pf-desc').value = p.description || '';
      document.getElementById('pf-price').value = p.price;
      document.getElementById('pf-original').value = p.original_price != null ? p.original_price : '';
      document.getElementById('pf-stock').value = p.stock;
      document.getElementById('pf-weight').value = p.weight || '';
      document.getElementById('pf-origin').value = p.origin || '';
      document.getElementById('pf-featured').checked = !!p.is_featured;
      document.getElementById('pf-bestseller').checked = !!p.is_bestseller;
      document.getElementById('pf-active').checked = !!p.is_active;
      const imgs = p.images;
      productImagesEdit = Array.isArray(imgs) ? imgs.slice() : [];
      const catSel = document.getElementById('pf-category');
      const slug = p.category || '';
      if (slug && catSel && ![...catSel.options].some((o) => o.value === slug)) {
        catSel.insertAdjacentHTML(
          'beforeend',
          `<option value="${escapeHtml(slug)}">${escapeHtml(slug)} (not in list)</option>`
        );
      }
      catSel.value = slug;
    } else {
      title.textContent = 'New product';
      productForm.reset();
      document.getElementById('pf-id').value = '';
      document.getElementById('pf-sku').readOnly = false;
      document.getElementById('pf-active').checked = true;
      productImagesEdit = [];
      await loadCategoriesForProductForm();
    }
    renderProductImagesEdit();
    productModal.hidden = false;
  }

  function closeProductModal() {
    productModal.hidden = true;
  }

  productModal.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeProductModal);
  });

  if (btnNewProduct) {
    btnNewProduct.addEventListener('click', () => {
      void openProductModal(null);
    });
  }

  if (productFilter) {
    productFilter.addEventListener('input', () => renderProductsTable());
  }

  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('product-form-msg');
    msg.textContent = '';
    const fd = new FormData(productForm);
    const id = document.getElementById('pf-id').value;
    fd.set('is_featured', document.getElementById('pf-featured').checked ? '1' : '');
    fd.set('is_bestseller', document.getElementById('pf-bestseller').checked ? '1' : '');
    fd.set('is_active', document.getElementById('pf-active').checked ? '1' : '');
    fd.delete('image');
    if (id) {
      fd.append('existing_images', JSON.stringify(productImagesEdit));
    }
    let res;
    if (id) {
      res = await apiProducts('/' + id, { method: 'PUT', body: fd });
    } else {
      res = await apiProducts('', { method: 'POST', body: fd });
    }
    if (!res.ok) {
      msg.textContent = await readError(res);
      msg.className = 'error';
      return;
    }
    msg.textContent = 'Saved.';
    msg.className = 'muted';
    closeProductModal();
    await loadProductsTable();
    await loadStats();
  });

  async function loadCategoriesTable() {
    if (!categoriesWrap) return;
    categoriesMsg.textContent = 'Loading…';
    const res = await api('/categories');
    if (!res.ok) {
      categoriesMsg.textContent = await readError(res);
      return;
    }
    categoriesMsg.textContent = '';
    const data = await res.json();
    const cats = data.categories || [];
    if (!cats.length) {
      categoriesWrap.innerHTML =
        '<p class="muted" style="padding:1rem">No categories in the database. Add one above, or restart the server to seed defaults.</p>';
      return;
    }
    const rows = cats.map((c) => {
      return `<tr data-cat-id="${c.id}">
        <td><code>${escapeHtml(c.slug)}</code></td>
        <td><input type="text" class="cat-name" value="${escapeHtml(c.name)}" aria-label="Name" /></td>
        <td><input type="text" class="cat-name-ar" value="${escapeHtml(c.name_ar || '')}" aria-label="Arabic" /></td>
        <td><input type="number" class="cat-sort" value="${c.sort_order}" style="width:4rem" /></td>
        <td><input type="checkbox" class="cat-active" ${c.is_active ? 'checked' : ''} /></td>
        <td>
          <button type="button" class="btn btn--primary btn--sm cat-save">Save</button>
          <button type="button" class="btn btn--ghost btn--sm cat-del">Delete</button>
        </td>
      </tr>`;
    });
    categoriesWrap.innerHTML = `
      <table class="admin-table admin-table--wide">
        <thead>
          <tr><th>Slug</th><th>Name</th><th>Arabic</th><th>Sort</th><th>Active</th><th></th></tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>`;
    categoriesWrap.querySelectorAll('tr[data-cat-id]').forEach((tr) => {
      const id = parseInt(tr.getAttribute('data-cat-id'), 10);
      tr.querySelector('.cat-save').addEventListener('click', async () => {
        categoriesMsg.textContent = 'Saving…';
        const body = {
          name: tr.querySelector('.cat-name').value,
          name_ar: tr.querySelector('.cat-name-ar').value,
          sort_order: parseInt(tr.querySelector('.cat-sort').value, 10) || 0,
          is_active: tr.querySelector('.cat-active').checked
        };
        const r = await api('/categories/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        categoriesMsg.textContent = r.ok ? 'Saved.' : await readError(r);
      });
      tr.querySelector('.cat-del').addEventListener('click', async () => {
        if (!confirm('Delete this category? (Only if no products use it.)')) return;
        categoriesMsg.textContent = '…';
        const r = await api('/categories/' + id, { method: 'DELETE' });
        categoriesMsg.textContent = r.ok ? 'Deleted.' : await readError(r);
        if (r.ok) loadCategoriesTable();
      });
    });
  }

  async function loadBannersTable() {
    if (!bannersWrap) return;
    bannersMsg.textContent = 'Loading…';
    const res = await api('/banners');
    if (!res.ok) {
      bannersMsg.textContent = await readError(res);
      return;
    }
    bannersMsg.textContent = '';
    const raw = await res.json();
    const list = Array.isArray(raw) ? raw : raw.banners || [];
    if (!list.length) {
      bannersWrap.innerHTML = '<p class="muted" style="padding:1rem">No banners yet. Add one above.</p>';
      return;
    }
    const rows = list.map((b) => {
      const src = bannerImgSrc(b.image_url || '');
      const imgPreview = src
        ? `<img src="${escapeHtml(src)}" alt="" width="120" height="40" style="object-fit:cover;border-radius:4px" loading="lazy" />`
        : '<span class="muted">—</span>';
      return `<tr data-banner-id="${b.id}">
        <td>${imgPreview}</td>
        <td><input type="text" class="b-title" value="${escapeHtml(b.title || '')}" /></td>
        <td><input type="text" class="b-img" value="${escapeHtml(b.image_url || '')}" /></td>
        <td><input type="text" class="b-link" value="${escapeHtml(b.link_url || '')}" /></td>
        <td><input type="number" class="b-sort" value="${b.sort_order}" style="width:4rem" /></td>
        <td><input type="checkbox" class="b-active" ${b.is_active ? 'checked' : ''} /></td>
        <td>
          <button type="button" class="btn btn--ghost btn--sm b-pick">Upload</button>
          <input type="file" class="b-file" hidden accept="image/jpeg,image/png,image/webp,image/gif" />
          <button type="button" class="btn btn--primary btn--sm b-save">Save</button>
          <button type="button" class="btn btn--ghost btn--sm b-del">Delete</button>
        </td>
      </tr>`;
    });
    bannersWrap.innerHTML = `
      <table class="admin-table admin-table--wide" aria-label="Banners">
        <thead>
          <tr><th></th><th>Title</th><th>Image URL</th><th>Link</th><th>Sort</th><th>Active</th><th></th></tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>`;
    bannersWrap.querySelectorAll('tr[data-banner-id]').forEach((tr) => {
      const id = parseInt(tr.getAttribute('data-banner-id'), 10);
      const fileInput = tr.querySelector('.b-file');
      tr.querySelector('.b-pick').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files[0];
        if (!f) return;
        bannersMsg.textContent = 'Uploading…';
        const up = await apiUploadImage(f);
        if (!up.ok) {
          bannersMsg.textContent = await readError(up);
          return;
        }
        const j = await up.json();
        tr.querySelector('.b-img').value = j.url || '';
        bannersMsg.textContent = 'Image uploaded — click Save to apply.';
        fileInput.value = '';
      });
      tr.querySelector('.b-save').addEventListener('click', async () => {
        bannersMsg.textContent = 'Saving…';
        const body = {
          title: tr.querySelector('.b-title').value,
          image_url: tr.querySelector('.b-img').value.trim(),
          link_url: tr.querySelector('.b-link').value.trim(),
          sort_order: parseInt(tr.querySelector('.b-sort').value, 10) || 0,
          is_active: tr.querySelector('.b-active').checked
        };
        const r = await api('/banners/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        bannersMsg.textContent = r.ok ? 'Saved.' : await readError(r);
        if (r.ok) {
          await loadBannersTable();
          await loadStats();
        }
      });
      tr.querySelector('.b-del').addEventListener('click', async () => {
        if (!confirm('Delete this banner?')) return;
        bannersMsg.textContent = '…';
        const r = await api('/banners/' + id, { method: 'DELETE' });
        bannersMsg.textContent = r.ok ? 'Deleted.' : await readError(r);
        if (r.ok) {
          await loadBannersTable();
          await loadStats();
        }
      });
    });
  }

  const bannerNewForm = document.getElementById('banner-new-form');
  if (bannerNewForm) {
    bannerNewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      bannersMsg.textContent = '…';
      const fd = new FormData(bannerNewForm);
      let image_url = String(fd.get('image_url') || '').trim();
      const fileEl = document.getElementById('banner-new-file');
      const file = fileEl && fileEl.files[0];
      if (file) {
        const up = await apiUploadImage(file);
        if (!up.ok) {
          bannersMsg.textContent = await readError(up);
          return;
        }
        const j = await up.json();
        image_url = j.url || image_url;
      }
      if (!image_url) {
        bannersMsg.textContent = 'Add an image URL or upload a file.';
        return;
      }
      const activeCb = bannerNewForm.querySelector('[name="is_active"]');
      const body = {
        title: fd.get('title') || '',
        image_url,
        link_url: String(fd.get('link_url') || '').trim(),
        sort_order: parseInt(fd.get('sort_order'), 10) || 0,
        is_active: activeCb ? activeCb.checked : true
      };
      const r = await api('/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      bannersMsg.textContent = r.ok ? 'Banner added.' : await readError(r);
      if (r.ok) {
        bannerNewForm.reset();
        if (activeCb) activeCb.checked = true;
        if (fileEl) fileEl.value = '';
        await loadBannersTable();
        await loadStats();
      }
    });
  }

  const categoryNewForm = document.getElementById('category-new-form');
  if (categoryNewForm) {
    categoryNewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      categoriesMsg.textContent = '…';
      const fd = new FormData(categoryNewForm);
      const body = {
        slug: fd.get('slug'),
        name: fd.get('name'),
        name_ar: fd.get('name_ar') || '',
        sort_order: fd.get('sort_order')
      };
      const r = await api('/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      categoriesMsg.textContent = r.ok ? 'Category added.' : await readError(r);
      if (r.ok) {
        categoryNewForm.reset();
        loadCategoriesTable();
      }
    });
  }

  const siteSettingsForm = document.getElementById('site-settings-form');
  if (siteSettingsForm) {
    siteSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('settings-msg');
      if (msgEl) {
        msgEl.textContent = '';
        msgEl.className = 'muted';
      }
      const settings = {};
      siteSettingsForm.querySelectorAll('[data-setting-key]').forEach((el) => {
        const k = el.getAttribute('data-setting-key');
        settings[k] = el.value;
      });
      const res = await api('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });
      if (!res.ok) {
        if (msgEl) {
          msgEl.textContent = await readError(res);
          msgEl.className = 'error';
        }
        return;
      }
      if (msgEl) {
        msgEl.textContent = 'Saved.';
        msgEl.className = 'muted';
      }
    });
  }

  async function loadMe() {
    const res = await api('/auth/me');
    if (!res.ok) return;
    const data = await res.json();
    const a = data.admin;
    if (adminUser) adminUser.textContent = a ? `Signed in as ${a.username} · ${a.role}` : '';
  }

  async function refreshDashboard() {
    try {
      await Promise.all([loadMe(), loadStats(), loadSiteSettingsForm()]);
    } catch (e) {
      if (dashError) dashError.textContent = 'Network error: ' + (e.message || '');
    }
  }

  const loginApiBaseInput = document.getElementById('login-api-base');
  const dashApiBaseInput = document.getElementById('dash-api-base');
  const btnSaveApiBase = document.getElementById('btn-save-api-base');
  const apiBaseStatus = document.getElementById('api-base-status');
  const fileProtocolBanner = document.getElementById('file-protocol-banner');

  function syncApiBaseInputs() {
    const v = getApiOrigin();
    if (loginApiBaseInput) loginApiBaseInput.value = v;
    if (dashApiBaseInput) dashApiBaseInput.value = v;
    if (apiBaseStatus) {
      apiBaseStatus.textContent = v
        ? 'Using API at ' + v + '/api …'
        : 'Using same-origin API (' + window.location.origin + '/api …).';
    }
  }

  if (fileProtocolBanner && window.location.protocol === 'file:') {
    fileProtocolBanner.style.display = '';
    fileProtocolBanner.textContent =
      'Open this admin from the Node server (e.g. http://localhost:3000/admin.html), not as a local file. Or set Backend URL to your API origin.';
  }

  if (btnSaveApiBase && dashApiBaseInput) {
    btnSaveApiBase.addEventListener('click', () => {
      const v = dashApiBaseInput.value.trim().replace(/\/$/, '');
      if (v) localStorage.setItem(API_BASE_STORAGE, v);
      else localStorage.removeItem(API_BASE_STORAGE);
      syncApiBaseInputs();
      window.location.reload();
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const fd = new FormData(loginForm);
    const rawBase = loginApiBaseInput ? loginApiBaseInput.value.trim().replace(/\/$/, '') : '';
    if (rawBase) localStorage.setItem(API_BASE_STORAGE, rawBase);
    else localStorage.removeItem(API_BASE_STORAGE);
    syncApiBaseInputs();
    let res;
    try {
      res = await fetch(apiRoot() + '/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          username: fd.get('username'),
          password: fd.get('password')
        })
      });
    } catch (err) {
      loginError.textContent =
        'Cannot reach the API. Start the Node server, then set Backend URL to its origin (e.g. http://localhost:3000) if this page is not served from that same address.';
      return;
    }
    let data;
    try {
      data = await res.json();
    } catch (e2) {
      loginError.textContent = 'Invalid response from server.';
      return;
    }
    if (!res.ok) {
      loginError.textContent = data.error || 'Login failed';
      return;
    }
    if (!data.token) {
      loginError.textContent = 'No token returned.';
      return;
    }
    setToken(data.token);
    showDash();
    initTabs();
    refreshDashboard();
  });

  logoutBtn.addEventListener('click', () => {
    setToken(null);
    showLogin();
  });

  (async function boot() {
    if (window.location.protocol !== 'file:') {
      await probeLocalApiOrigin();
    }
    syncApiBaseInputs();
    if (token()) {
      showDash();
      initTabs();
      refreshDashboard();
    } else {
      showLogin();
    }
  })();
})();
