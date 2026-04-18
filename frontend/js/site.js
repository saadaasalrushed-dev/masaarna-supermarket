(function () {
  function show(el, on) {
    if (!el) return;
    el.hidden = !on;
    el.style.display = on ? '' : 'none';
  }

  function setText(sel, text) {
    document.querySelectorAll(sel).forEach((el) => {
      el.textContent = text;
    });
  }

  async function load() {
    try {
      const res = await fetch('/api/site');
      if (!res.ok) return;
      const c = await res.json();

      setText('[data-site-name]', c.siteName || 'Masaarna');
      setText('[data-site-tagline]', c.tagline || 'Trust & Heritage');

      const logo = document.querySelector('[data-site-logo]');
      if (logo && c.logoUrl) {
        logo.src = c.logoUrl;
        logo.alt = c.siteName || 'Masaarna';
      }

      const soc = c.social || {};
      const mapLink = (id, url) => {
        const a = document.getElementById(id);
        if (!a) return;
        if (url && String(url).trim()) {
          a.href = url;
          show(a, true);
        } else {
          show(a, false);
        }
      };

      mapLink('social-whatsapp', soc.whatsapp);
      mapLink('mobile-nav-whatsapp', soc.whatsapp);
      mapLink('social-instagram', soc.instagram);
      mapLink('social-tiktok', soc.tiktok);
      mapLink('social-google-review', soc.googleReview);
      mapLink('social-facebook', soc.facebook);

      const phone = document.getElementById('contact-phone');
      const phoneLine = document.getElementById('contact-phone-line');
      if (phone) {
        const ph = (c.contact && c.contact.phone) || '';
        phone.textContent = ph;
        if (phoneLine) show(phoneLine, !!ph.trim());
      }
      const email = document.getElementById('contact-email');
      const emailLine = document.getElementById('contact-email-line');
      if (email) {
        const em = (c.contact && c.contact.email) || '';
        email.textContent = em;
        if (em) {
          email.href = 'mailto:' + em;
        }
        if (emailLine) show(emailLine, !!em.trim());
      }

      const mapLinkEl = document.getElementById('map-open-link');
      if (mapLinkEl) {
        const m = c.contact && c.contact.mapLinkUrl;
        if (m && String(m).trim()) {
          mapLinkEl.href = m;
          show(mapLinkEl, true);
        } else {
          show(mapLinkEl, false);
        }
      }

      const iframe = document.getElementById('site-map-iframe');
      if (iframe && c.contact && c.contact.mapEmbedUrl) {
        iframe.src = c.contact.mapEmbedUrl;
        const wrap = document.getElementById('site-map-wrap');
        if (wrap) {
          wrap.style.display = 'block';
          wrap.hidden = false;
        }
      }
    } catch (e) {
      console.warn('Site config:', e.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
