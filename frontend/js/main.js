(function () {
  const elGrid = document.getElementById('product-grid');
  const elCart = document.getElementById('cart-lines');
  const elSubtotal = document.getElementById('cart-subtotal');
  const elCount = document.getElementById('cart-count');
  const elFilter = document.getElementById('category-filters');
  const elSearch = document.getElementById('search-q');
  const searchBtn = document.getElementById('search-submit');
  const linkCheckout = document.getElementById('link-checkout');
  const elCategoryNav = document.getElementById('category-nav-grid');
  const scrollTopBtn = document.getElementById('scroll-top');
  const promoTrack = document.getElementById('promo-track');
  const promoViewport = document.getElementById('promo-viewport');
  const promoDots = document.getElementById('promo-dots');
  const promoPrev = document.querySelector('.promo-carousel__nav--prev');
  const promoNext = document.querySelector('.promo-carousel__nav--next');
  const featuredSection = document.getElementById('featured-section');
  const featuredScroll = document.getElementById('featured-scroll');
  const qvModal = document.getElementById('quick-view');
  const qvTrack = document.getElementById('qv-track');
  const qvViewport = document.getElementById('qv-viewport');
  const qvTitle = document.getElementById('qv-title');
  const qvPrice = document.getElementById('qv-price');
  const qvMeta = document.getElementById('qv-meta');
  const qvAdd = document.getElementById('qv-add');
  const qvDots = document.getElementById('qv-dots');

  let category = '';
  let searchDebounce;
  let promoIndex = 0;
  let promoSlides = [];
  let promoResizeObserver = null;
  let qvProduct = null;
  let qvImgIndex = 0;

  const PLACEHOLDER_IMG =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect fill="#f1f5f9" width="320" height="320"/><text x="160" y="170" text-anchor="middle" fill="#64748b" font-family="system-ui" font-size="14">Masaarna</text></svg>'
    );

  const FALLBACK_BANNERS = [
    { title: 'Fresh picks', image_url: '/assets/banners/banner-1.svg', link_url: '/#shop' },
    { title: 'Pantry', image_url: '/assets/banners/banner-2.svg', link_url: '/#shop' },
    { title: 'Snacks', image_url: '/assets/banners/banner-3.svg', link_url: '/#shop' }
  ];

  function imgUrl(u) {
    if (!u) return PLACEHOLDER_IMG;
    if (/^https?:\/\//i.test(u)) return u;
    return u.startsWith('/') ? u : '/' + u;
  }

  /** Grid / thumbs: first image; modal full: last when two URLs (thumb + full). */
  function productImages(p) {
    const raw = p.images;
    let list = [];
    if (Array.isArray(raw)) list = raw;
    else if (typeof raw === 'string') {
      try {
        list = JSON.parse(raw);
      } catch (e) {
        list = [];
      }
    }
    return list.filter(Boolean);
  }

  function thumbForProduct(p) {
    const list = productImages(p);
    return imgUrl(list[0] || '');
  }

  function galleryForProduct(p) {
    const list = productImages(p);
    if (!list.length) return [PLACEHOLDER_IMG];
    if (list.length === 1) return [imgUrl(list[0])];
    return list.map((x) => imgUrl(x));
  }

  function money(n) {
    return `AED ${Number(n).toFixed(2)}`;
  }

  function stars(avg, count) {
    const a = Number(avg) || 0;
    const full = Math.round(a);
    let s = '';
    for (let i = 1; i <= 5; i++) s += i <= full ? '★' : '☆';
    const label = count > 0 ? ` ${a.toFixed(1)} (${count})` : ' New';
    return `<span class="product-card__stars" aria-hidden="true">${s}</span><span>${label}</span>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCart() {
    const lines = window.MasaarnaCart.getCart();
    elCart.innerHTML = '';
    if (!lines.length) {
      elCart.innerHTML = '<p class="empty">Your basket is empty. Add items from the grid.</p>';
    } else {
      lines.forEach((l) => {
        const row = document.createElement('div');
        row.className = 'cart-line';
        row.innerHTML = `
          <div class="cart-line__top">
            <span class="cart-line__title">${escapeHtml(l.name)}</span>
            <span class="cart-line__price">${money(l.qty * l.price)}</span>
          </div>
          <div class="cart-line__controls">
            <input type="number" min="1" value="${l.qty}" data-id="${l.id}" aria-label="Quantity for ${escapeHtml(l.name)}" />
            <button type="button" class="btn btn--ghost" data-remove="${l.id}">Remove</button>
          </div>`;
        elCart.appendChild(row);
      });
      elCart.querySelectorAll('input[data-id]').forEach((inp) => {
        inp.addEventListener('change', () => {
          window.MasaarnaCart.setQty(parseInt(inp.dataset.id, 10), parseInt(inp.value, 10));
          renderCart();
        });
      });
      elCart.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          window.MasaarnaCart.removeItem(parseInt(btn.getAttribute('data-remove'), 10));
          renderCart();
        });
      });
    }
    const sub = window.MasaarnaCart.clientSubtotalFromCart();
    elSubtotal.textContent = money(sub);
    const n = lines.reduce((s, l) => s + l.qty, 0);
    elCount.textContent = n ? String(n) : '';
    if (linkCheckout) {
      const ok = lines.length > 0 && sub > 0;
      linkCheckout.classList.toggle('is-disabled', !ok);
      linkCheckout.setAttribute('aria-disabled', ok ? 'false' : 'true');
    }
  }

  /** Each slide must match viewport width (flex % can resolve wrong inside horizontal track). */
  function sizePromoSlides() {
    if (!promoViewport || !promoTrack) return;
    const w = promoViewport.clientWidth;
    promoTrack.querySelectorAll('.promo-carousel__slide').forEach((el) => {
      el.style.flex = `0 0 ${w}px`;
      el.style.width = `${w}px`;
      el.style.minWidth = `${w}px`;
    });
  }

  function goPromo(i) {
    if (!promoSlides.length) return;
    promoIndex = (i + promoSlides.length) % promoSlides.length;
    if (promoViewport) {
      const w = promoViewport.clientWidth || 1;
      promoViewport.scrollTo({ left: promoIndex * w, behavior: 'smooth' });
    }
    if (promoDots) {
      promoDots.querySelectorAll('.promo-carousel__dot').forEach((d, j) => {
        d.classList.toggle('is-active', j === promoIndex);
        d.setAttribute('aria-selected', j === promoIndex ? 'true' : 'false');
      });
    }
  }

  function initPromoCarousel(banners) {
    if (!promoTrack) return;
    promoSlides = banners && banners.length ? banners : FALLBACK_BANNERS;
    promoTrack.innerHTML = '';
    promoSlides.forEach((b, idx) => {
      const slide = document.createElement('div');
      slide.className = 'promo-carousel__slide';
      const href = b.link_url || '/#shop';
      const imgSrc = imgUrl(b.image_url || '');
      slide.innerHTML = `
        <a href="${escapeHtml(href)}" class="promo-carousel__link">
          <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(b.title || 'Promotion')}" width="1200" height="400" loading="${idx === 0 ? 'eager' : 'lazy'}" />
        </a>`;
      promoTrack.appendChild(slide);
    });
    if (promoDots) {
      promoDots.innerHTML = '';
      promoSlides.forEach((_, j) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'promo-carousel__dot' + (j === 0 ? ' is-active' : '');
        dot.setAttribute('aria-label', `Slide ${j + 1}`);
        dot.setAttribute('aria-selected', j === 0 ? 'true' : 'false');
        dot.addEventListener('click', () => goPromo(j));
        promoDots.appendChild(dot);
      });
    }
    goPromo(0);
    if (promoViewport) {
      let scrollEndTimer;
      promoViewport.addEventListener('scroll', () => {
        clearTimeout(scrollEndTimer);
        scrollEndTimer = setTimeout(() => {
          const w = promoViewport.clientWidth || 1;
          const idx = Math.round(promoViewport.scrollLeft / w);
          if (idx !== promoIndex && idx >= 0 && idx < promoSlides.length) {
            promoIndex = idx;
            if (promoDots) {
              promoDots.querySelectorAll('.promo-carousel__dot').forEach((d, j) => {
                d.classList.toggle('is-active', j === promoIndex);
              });
            }
          }
        }, 80);
      });
    }
    if (promoPrev) promoPrev.addEventListener('click', () => goPromo(promoIndex - 1));
    if (promoNext) promoNext.addEventListener('click', () => goPromo(promoIndex + 1));

    sizePromoSlides();
    if (promoResizeObserver) promoResizeObserver.disconnect();
    if (promoViewport) {
      promoResizeObserver = new ResizeObserver(() => {
        sizePromoSlides();
        goPromo(promoIndex);
      });
      promoResizeObserver.observe(promoViewport);
    }
  }

  async function loadBanners() {
    let list = [];
    try {
      const res = await fetch('/api/banners');
      if (res.ok) {
        const data = await res.json();
        list = data.banners || [];
      }
    } catch (e) {
      /* use fallback */
    }
    initPromoCarousel(list.length ? list : null);
  }

  function renderQuickViewImages() {
    if (!qvTrack || !qvProduct) return;
    const urls = galleryForProduct(qvProduct);
    qvImgIndex = Math.min(qvImgIndex, urls.length - 1);
    qvTrack.innerHTML = urls
      .map(
        (u, i) =>
          `<div class="qv-carousel__slide" data-qi="${i}"><img src="${escapeHtml(u)}" alt="" /></div>`
      )
      .join('');
    requestAnimationFrame(() => {
      if (qvViewport) {
        const w = qvViewport.clientWidth || 1;
        qvViewport.scrollTo({ left: qvImgIndex * w, behavior: 'auto' });
      }
    });
    if (qvDots) {
      qvDots.innerHTML = '';
      urls.forEach((_, j) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'qv-carousel__dot' + (j === qvImgIndex ? ' is-active' : '');
        b.setAttribute('aria-label', `Image ${j + 1}`);
        b.addEventListener('click', () => {
          qvImgIndex = j;
          renderQuickViewImages();
        });
        qvDots.appendChild(b);
      });
    }
  }

  function openQuickView(p) {
    qvProduct = p;
    qvImgIndex = 0;
    if (!qvModal) return;
    if (qvTitle) qvTitle.textContent = p.name || 'Product';
    if (qvPrice) qvPrice.textContent = money(p.price);
    if (qvMeta) {
      qvMeta.textContent = [p.brand, p.category_name || p.category].filter(Boolean).join(' · ');
    }
    renderQuickViewImages();
    qvModal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (qvAdd) {
      qvAdd.onclick = () => {
        window.MasaarnaCart.addItem(p, 1);
        renderCart();
      };
    }
  }

  function closeQuickView() {
    if (!qvModal) return;
    qvModal.hidden = true;
    document.body.style.overflow = '';
    qvProduct = null;
  }

  if (qvModal) {
    qvModal.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', closeQuickView);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !qvModal.hidden) closeQuickView();
    });
    if (qvViewport) {
      let qvScrollTimer;
      qvViewport.addEventListener('scroll', () => {
        clearTimeout(qvScrollTimer);
        qvScrollTimer = setTimeout(() => {
          const urls = qvProduct ? galleryForProduct(qvProduct) : [];
          const w = qvViewport.clientWidth || 1;
          const idx = Math.round(qvViewport.scrollLeft / w);
          if (idx >= 0 && idx < urls.length) {
            qvImgIndex = idx;
            if (qvDots) {
              qvDots.querySelectorAll('.qv-carousel__dot').forEach((d, j) => {
                d.classList.toggle('is-active', j === qvImgIndex);
              });
            }
          }
        }, 80);
      });
    }
  }

  function renderProductCard(p, compact) {
    const img = thumbForProduct(p);
    const badge =
      p.is_featured || p.is_bestseller
        ? `<span class="product-card__badge">${p.is_bestseller ? 'Bestseller' : 'Featured'}</span>`
        : '';
    const card = document.createElement('article');
    card.className = 'product-card' + (compact ? ' product-card--compact' : '');
    card.innerHTML = `
      <div class="product-card__media">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" loading="lazy" width="320" height="320" />
        ${badge}
      </div>
      <div class="product-card__body">
        <span class="product-card__brand">${escapeHtml(p.brand || 'Masaarna')}</span>
        <h3 class="product-card__title">${escapeHtml(p.name)}</h3>
        <div class="product-card__meta">${escapeHtml(p.category_name || p.category || '')}</div>
        <div class="product-card__rating">${stars(p.rating_avg, p.rating_count)}</div>
        <div class="product-card__footer">
          <div class="product-card__price">${money(p.price)}</div>
          <div class="product-card__actions">
            <button type="button" class="btn btn--ghost btn--sm" data-qview="${p.id}">View</button>
            <button type="button" class="btn btn--primary btn--cart" data-add="${p.id}">Add</button>
          </div>
        </div>
      </div>`;
    card.querySelector('[data-add]').addEventListener('click', () => {
      window.MasaarnaCart.addItem(p, 1);
      renderCart();
    });
    card.querySelector('[data-qview]').addEventListener('click', () => openQuickView(p));
    return card;
  }

  async function loadFeatured() {
    if (!featuredScroll || !featuredSection) return;
    try {
      const res = await fetch('/api/products?filter=featured&limit=24');
      const data = await res.json();
      const list = data.products || [];
      featuredScroll.innerHTML = '';
      if (!list.length) {
        featuredSection.hidden = true;
        return;
      }
      featuredSection.hidden = false;
      list.forEach((p) => {
        featuredScroll.appendChild(renderProductCard(p, true));
      });
    } catch (e) {
      featuredSection.hidden = true;
    }
  }

  async function loadProducts() {
    const params = new URLSearchParams({ limit: '48' });
    if (category) params.set('category', category);
    const q = elSearch && elSearch.value.trim();
    if (q) params.set('q', q);
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    elGrid.innerHTML = '';
    const list = data.products || [];
    if (!list.length) {
      elGrid.innerHTML =
        '<p class="muted" style="grid-column: 1/-1; padding: 2rem; text-align: center;">No products match your filters. Try another category or search.</p>';
      return;
    }
    list.forEach((p) => {
      elGrid.appendChild(renderProductCard(p, false));
    });
  }

  function themeClassForSlug(slug) {
    const map = {
      beverages: 'category-nav__card--beverages',
      snacks: 'category-nav__card--snacks',
      dairy: 'category-nav__card--dairy',
      grains: 'category-nav__card--grains',
      canned: 'category-nav__card--canned',
      cleaning: 'category-nav__card--cleaning',
      personal: 'category-nav__card--personal'
    };
    return map[slug] || 'category-nav__card--default';
  }

  function emojiForSlug(slug) {
    const map = {
      beverages: '🍵',
      snacks: '🍬',
      dairy: '🥛',
      grains: '🌾',
      canned: '🥫',
      cleaning: '🧽',
      personal: '🧴'
    };
    return map[slug] || '📦';
  }

  function formatItemCount(n) {
    const x = Number(n) || 0;
    if (x === 0) return 'No items yet';
    return `${x} item${x === 1 ? '' : 's'}`;
  }

  function scrollToShop() {
    const shop = document.getElementById('shop');
    if (shop) shop.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setCategory(slug) {
    category = slug || '';
    document.querySelectorAll('#category-filters .chip').forEach((btn) => {
      const s = btn.dataset.slug != null ? btn.dataset.slug : '';
      btn.classList.toggle('is-active', s === category);
    });
    document.querySelectorAll('.category-nav__card').forEach((el) => {
      const s = el.dataset.slug != null ? el.dataset.slug : '';
      const match = s === category;
      el.classList.toggle('is-active', match);
      el.setAttribute('aria-pressed', match ? 'true' : 'false');
    });
    loadProducts();
    if (window.MasaarnaMobileTabbar) window.MasaarnaMobileTabbar.setActive(category);
  }

  function renderCategoryNav(cats, total) {
    if (!elCategoryNav) return;
    const parts = [];
    cats.forEach((c) => {
      const slug = c.slug;
      const active = category === slug;
      parts.push(
        `<button type="button" class="category-nav__card ${themeClassForSlug(slug)}${active ? ' is-active' : ''}" data-slug="${escapeHtml(slug)}" aria-pressed="${active ? 'true' : 'false'}">
          <span class="category-nav__icon" aria-hidden="true">${emojiForSlug(slug)}</span>
          <span class="category-nav__name">${escapeHtml(c.name)}</span>
          <span class="category-nav__count">${formatItemCount(Number(c.count))}</span>
        </button>`
      );
    });
    const allActive = !category;
    parts.push(
      `<button type="button" class="category-nav__card category-nav__card--all${allActive ? ' is-active' : ''}" data-slug="" aria-pressed="${allActive ? 'true' : 'false'}">
        <span class="category-nav__icon" aria-hidden="true">🛒</span>
        <span class="category-nav__name">All products</span>
        <span class="category-nav__count">${formatItemCount(total)}</span>
      </button>`
    );
    elCategoryNav.innerHTML = parts.join('');
    elCategoryNav.querySelectorAll('.category-nav__card').forEach((btn) => {
      btn.addEventListener('click', () => {
        setCategory(btn.dataset.slug || '');
        scrollToShop();
      });
    });
  }

  async function initCategoryFilters() {
    elFilter.innerHTML = '';
    if (elCategoryNav) elCategoryNav.innerHTML = '<p class="muted">Loading categories…</p>';
    const res = await fetch('/api/products/meta/category-counts');
    if (!res.ok) {
      if (elCategoryNav) elCategoryNav.innerHTML = '<p class="muted">Could not load categories.</p>';
      if (window.MasaarnaMobileTabbar) window.MasaarnaMobileTabbar.showListError('Could not load categories.');
      return false;
    }
    const data = await res.json();
    const cats = data.categories || [];
    const total = data.total != null ? data.total : 0;

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'chip' + (!category ? ' is-active' : '');
    allBtn.dataset.slug = '';
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', () => {
      setCategory('');
      scrollToShop();
    });
    elFilter.appendChild(allBtn);

    cats.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (category === c.slug ? ' is-active' : '');
      b.dataset.slug = c.slug;
      b.textContent = c.name;
      b.addEventListener('click', () => {
        setCategory(c.slug);
        scrollToShop();
      });
      elFilter.appendChild(b);
    });

    renderCategoryNav(cats, total);
    if (window.MasaarnaMobileTabbar) window.MasaarnaMobileTabbar.refresh(cats, total);

    const urlCat = new URLSearchParams(window.location.search).get('category');
    if (urlCat) {
      setCategory(urlCat);
      return true;
    }
    return false;
  }

  window.addEventListener('masaarna-cart', renderCart);

  function triggerSearch() {
    loadProducts();
  }

  window.addEventListener('masaarna-apply-search', (e) => {
    const q = e.detail && e.detail.q != null ? String(e.detail.q) : '';
    if (elSearch) elSearch.value = q;
    const sheetInput = document.getElementById('search-q-sheet');
    if (sheetInput) sheetInput.value = q;
    triggerSearch();
    scrollToShop();
  });

  if (elSearch) {
    elSearch.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(triggerSearch, 280);
    });
    elSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchDebounce);
        triggerSearch();
      }
    });
  }
  if (searchBtn) searchBtn.addEventListener('click', triggerSearch);

  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      scrollTopBtn.classList.toggle('is-visible', window.scrollY > 320);
    });
    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  window.addEventListener('masaarna-mobile-category', (e) => {
    const slug = e.detail && e.detail.slug != null ? e.detail.slug : '';
    setCategory(slug);
    scrollToShop();
  });

  renderCart();
  loadBanners();
  loadFeatured();
  initCategoryFilters().then((skipDuplicateLoad) => {
    if (!skipDuplicateLoad) loadProducts();
    try {
      if (sessionStorage.getItem('masaarna_open_search') === '1') {
        sessionStorage.removeItem('masaarna_open_search');
        if (window.MasaarnaMobileTabbar && window.MasaarnaMobileTabbar.openSearch) {
          window.MasaarnaMobileTabbar.openSearch();
        }
      }
    } catch (err) {}
  });
})();
