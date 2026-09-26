// Shared across all public pages: API helper, cart storage, cart-count badge.
var AtlasCommon = (function () {
  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    options.credentials = 'same-origin';
    return fetch(path, options).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
    }).catch(function (err) {
      console.error('API request failed:', path, err);
      return { ok: false, status: 0, data: { error: 'Network error — could not reach the server.' } };
    });
  }

  function fmtPrice(n) { return Number(n).toLocaleString('en-US') + ' $'; }
  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // Cart lives in localStorage so it survives navigation between separate
  // pages (Shop / Cart / Delivery Map are now different URLs, not tabs).
  var CART_KEY = 'atlas-supply-cart';

  function getCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function setCart(cart) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) { /* storage unavailable, cart just won't persist */ }
    updateCartBadge();
  }

  function addToCart(id, qty) {
    var cart = getCart();
    cart[id] = (cart[id] || 0) + qty;
    setCart(cart);
  }

  function clearCart() {
    setCart({});
  }

  function updateCartBadge() {
    var cart = getCart();
    var count = Object.values(cart).reduce(function (a, b) { return a + b; }, 0);
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = count;
    });
  }

  // Highlight the current page's nav link based on the current path.
  function initNav() {
    var path = window.location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('.nav-btn[href]').forEach(function (link) {
      var href = link.getAttribute('href').replace(/\/$/, '') || '/';
      if (href === path) link.classList.add('active');
      else link.classList.remove('active');
    });
    updateCartBadge();
  }

  document.addEventListener('DOMContentLoaded', initNav);

  return {
    api: api,
    fmtPrice: fmtPrice,
    escapeHtml: escapeHtml,
    getCart: getCart,
    setCart: setCart,
    addToCart: addToCart,
    clearCart: clearCart,
    updateCartBadge: updateCartBadge
  };
})();
