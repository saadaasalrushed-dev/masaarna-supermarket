/**
 * Mobile bottom bar + category sheet — shared by index & checkout.
 * Index calls MasaarnaMobileTabbar.refresh / setActive from main.js.
 * Checkout loads categories via fetch here.
 */
(function () {
  const tabbar = document.getElementById('mobile-tabbar');
  if (!tabbar) return;

  const isCheckout =
    /checkout\.html$/i.test(location.pathname) || location.pathname.endsWith('/checkout');
  let categoryMeta = { cats: [], total: 0 };
  let activeSlug = isCheckout ? new URLSearchParams(location.search).get('category') || '' : '';

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function syncBodyScrollLock() {
    const searchSheet = document.getElementById('mobile-search-sheet');
    const catSheet = document.getElementById('mobile-category-sheet');
    const sOpen = searchSheet && !searchSheet.hidden;
    const cOpen = catSheet && !catSheet.hidden;
    document.body.style.overflow = sOpen || cOpen ? 'hidden' : '';
  }

  function closeSearchSheet() {
    const sheet = document.getElementById('mobile-search-sheet');
    const btn = document.getElementById('mobile-tab-search');
    if (sheet) sheet.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    syncBodyScrollLock();
  }

  function closeCategorySheet() {
    const sheet = document.getElementById('mobile-category-sheet');
    const btn = document.getElementById('mobile-tab-categories');
    if (sheet) sheet.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    syncBodyScrollLock();
  }

  function openSearchSheet() {
    const sheet = document.getElementById('mobile-search-sheet');
    if (!sheet) {
      try {
        sessionStorage.setItem('masaarna_open_search', '1');
      } catch (e) {}
      window.location.href = '/';
      return;
    }
    closeCategorySheet();
    const main = document.getElementById('search-q');
    const sh = document.getElementById('search-q-sheet');
    if (main && sh) sh.value = main.value;
    sheet.hidden = false;
    const btn = document.getElementById('mobile-tab-search');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    syncBodyScrollLock();
    requestAnimationFrame(() => {
      if (sh) sh.focus();
    });
  }

  function applySearchFromSheet() {
    const sh = document.getElementById('search-q-sheet');
    const q = sh ? String(sh.value || '').trim() : '';
    const main = document.getElementById('search-q');
    if (main) main.value = q;
    closeSearchSheet();
    window.dispatchEvent(new CustomEvent('masaarna-apply-search', { detail: { q } }));
  }

  function openCategorySheet() {
    closeSearchSheet();
    const sheet = document.getElementById('mobile-category-sheet');
    const btn = document.getElementById('mobile-tab-categories');
    if (!sheet) return;
    sheet.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
    syncBodyScrollLock();
  }

  function renderList() {
    const wrap = document.getElementById('mobile-category-list');
    if (!wrap) return;
    const { cats, total } = categoryMeta;
    if (!cats.length) {
      wrap.innerHTML =
        '<p class="muted" style="padding:1rem">' +
        (isCheckout ? 'Loading categories…' : 'No categories in catalog.') +
        '</p>';
      return;
    }
    const parts = [];
    cats.forEach((c) => {
      const active = activeSlug === c.slug;
      parts.push(
        `<button type="button" class="mobile-cat-row${active ? ' is-active' : ''}" data-slug="${escapeHtml(c.slug)}">
          <span class="mobile-cat-row__emoji" aria-hidden="true">${emojiForSlug(c.slug)}</span>
          <span class="mobile-cat-row__name">${escapeHtml(c.name)}</span>
          <span class="mobile-cat-row__count muted">${formatItemCount(Number(c.count))}</span>
        </button>`
      );
    });
    const allActive = !activeSlug;
    parts.push(
      `<button type="button" class="mobile-cat-row${allActive ? ' is-active' : ''}" data-slug="">
        <span class="mobile-cat-row__emoji" aria-hidden="true">🛒</span>
        <span class="mobile-cat-row__name">All products</span>
        <span class="mobile-cat-row__count muted">${formatItemCount(total)}</span>
      </button>`
    );
    wrap.innerHTML = parts.join('');
    wrap.querySelectorAll('.mobile-cat-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.dataset.slug || '';
        closeCategorySheet();
        if (isCheckout) {
          window.location.href = slug ? '/?category=' + encodeURIComponent(slug) : '/';
        } else {
          window.dispatchEvent(new CustomEvent('masaarna-mobile-category', { detail: { slug } }));
        }
      });
    });
  }

  function updateCartBadge() {
    const lines = window.MasaarnaCart && window.MasaarnaCart.getCart ? window.MasaarnaCart.getCart() : [];
    const n = lines.reduce((s, l) => s + l.qty, 0);
    const mobileCartBadge = document.getElementById('mobile-tabbar-cart-count');
    if (mobileCartBadge) {
      if (n > 0) {
        mobileCartBadge.textContent = n > 99 ? '99+' : String(n);
        mobileCartBadge.hidden = false;
      } else {
        mobileCartBadge.hidden = true;
      }
    }
  }

  const mobileCatBtn = document.getElementById('mobile-tab-categories');
  const mobileSearchBtn = document.getElementById('mobile-tab-search');
  const mobileSearchSheet = document.getElementById('mobile-search-sheet');
  const mobileSheetEl = document.getElementById('mobile-category-sheet');
  const mobileSheetClose = document.getElementById('mobile-sheet-close');

  if (mobileSearchBtn) {
    mobileSearchBtn.addEventListener('click', () => openSearchSheet());
  }
  if (mobileSearchSheet) {
    const bd = mobileSearchSheet.querySelector('[data-mobile-search-backdrop], .mobile-sheet__backdrop');
    if (bd) bd.addEventListener('click', closeSearchSheet);
    const closeBtn = document.getElementById('mobile-search-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSearchSheet);
    const submitBtn = document.getElementById('search-submit-sheet');
    if (submitBtn) submitBtn.addEventListener('click', applySearchFromSheet);
    const shInput = document.getElementById('search-q-sheet');
    if (shInput) {
      shInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applySearchFromSheet();
        }
      });
    }
  }

  if (mobileCatBtn) mobileCatBtn.addEventListener('click', openCategorySheet);
  if (mobileSheetEl) {
    const bd = mobileSheetEl.querySelector('.mobile-sheet__backdrop');
    if (bd) bd.addEventListener('click', closeCategorySheet);
  }
  if (mobileSheetClose) mobileSheetClose.addEventListener('click', closeCategorySheet);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const searchSheet = document.getElementById('mobile-search-sheet');
    if (searchSheet && !searchSheet.hidden) {
      closeSearchSheet();
      return;
    }
    closeCategorySheet();
  });

  window.addEventListener('masaarna-cart', updateCartBadge);
  updateCartBadge();

  async function loadCategoriesForCheckout() {
    const res = await fetch('/api/products/meta/category-counts');
    if (!res.ok) {
      showListError('Could not load categories.');
      return;
    }
    const data = await res.json();
    const cats = data.categories || [];
    const total = data.total != null ? data.total : 0;
    categoryMeta = { cats, total };
    renderList();
  }

  function showListError(msg) {
    const wrap = document.getElementById('mobile-category-list');
    if (wrap) wrap.innerHTML = `<p class="muted" style="padding:1rem">${escapeHtml(msg)}</p>`;
  }

  window.MasaarnaMobileTabbar = {
    refresh(cats, total) {
      categoryMeta = { cats: cats || [], total: total != null ? total : 0 };
      renderList();
    },
    setActive(slug) {
      activeSlug = slug || '';
      renderList();
    },
    showListError,
    openSearch: openSearchSheet,
    closeSearch: closeSearchSheet
  };

  if (isCheckout) loadCategoriesForCheckout();
})();
