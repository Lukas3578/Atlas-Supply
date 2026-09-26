(function () {
  var STOCK_LABELS = { in: 'In stock', low: 'Low stock', out: 'Out of stock' };
  var api = AtlasCommon.api;
  var fmtPrice = AtlasCommon.fmtPrice;
  var escapeHtml = AtlasCommon.escapeHtml;

  function loadProducts() {
    api('/api/products').then(function (res) {
      renderShop(res.data || []);
    });
  }

  function renderShop(products) {
    var grid = document.getElementById('product-grid');
    grid.innerHTML = '';
    products.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'product-card';
      var disabled = p.stock === 'out' ? 'disabled' : '';
      card.innerHTML =
        '<h3>' + escapeHtml(p.name) + '</h3>' +
        '<div class="unit">' + escapeHtml(p.unit) + '</div>' +
        '<div class="price">' + fmtPrice(p.price) + '</div>' +
        '<div class="stock ' + p.stock + '">' + STOCK_LABELS[p.stock] + '</div>' +
        '<div class="qty-row">' +
          '<input type="number" min="1" value="1" id="qty-' + p.id + '" ' + disabled + '>' +
          '<button class="btn small" data-add="' + p.id + '" ' + disabled + '>Add to cart</button>' +
        '</div>';
      grid.appendChild(card);
    });
    grid.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.add;
        var qtyInput = document.getElementById('qty-' + id);
        var qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        AtlasCommon.addToCart(id, qty);
        btn.textContent = 'Added!';
        setTimeout(function () { btn.textContent = 'Add to cart'; }, 900);
      });
    });
  }

  loadProducts();
})();
