(function () {
  var api = AtlasCommon.api;
  var fmtPrice = AtlasCommon.fmtPrice;
  var escapeHtml = AtlasCommon.escapeHtml;
  var products = [];

  function loadAndRenderCart() {
    api('/api/products').then(function (res) {
      products = res.data || [];
      renderCart();
    });
  }

  function renderCart() {
    var cart = AtlasCommon.getCart();
    var box = document.getElementById('cart-lines');
    var ids = Object.keys(cart).filter(function (id) { return cart[id] > 0; });
    if (ids.length === 0) {
      box.innerHTML = '<div class="empty-msg">Your cart is empty. <a href="/" style="color:var(--cyan);">Go back to the shop</a> and pick some products.</div>';
      return;
    }
    var total = 0;
    var html = '';
    ids.forEach(function (id) {
      var p = products.find(function (x) { return String(x.id) === String(id); });
      if (!p) return;
      var qty = cart[id];
      var sum = p.price * qty;
      total += sum;
      html += '<div class="cart-line"><span>' + escapeHtml(p.name) + ' x' + qty + '</span><span>' + fmtPrice(sum) + '</span></div>';
    });
    html += '<div class="cart-total"><span>Total</span><span>' + fmtPrice(total) + '</span></div>';
    box.innerHTML = html;
  }

  document.getElementById('order-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var nameEl = document.getElementById('cust-name');
    var contactEl = document.getElementById('cust-contact');
    var noteEl = document.getElementById('cust-note');
    var errName = document.getElementById('err-name');
    var errContact = document.getElementById('err-contact');
    errName.textContent = '';
    errContact.textContent = '';

    var cart = AtlasCommon.getCart();
    var ids = Object.keys(cart).filter(function (id) { return cart[id] > 0; });
    var valid = true;
    if (!nameEl.value.trim()) { errName.textContent = 'Please enter a name.'; valid = false; }
    if (!contactEl.value.trim()) { errContact.textContent = 'Please enter a contact.'; valid = false; }
    if (ids.length === 0) {
      alert('Your cart is empty. Please add products first.');
      return;
    }
    if (!valid) return;

    var items = ids.map(function (id) { return { id: parseInt(id, 10), qty: cart[id] }; });

    api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        name: nameEl.value.trim(),
        contact: contactEl.value.trim(),
        note: noteEl.value.trim(),
        items: items
      })
    }).then(function (res) {
      if (!res.ok) {
        alert((res.data && res.data.error) || 'Something went wrong.');
        return;
      }
      AtlasCommon.clearCart();
      renderCart();
      nameEl.value = '';
      contactEl.value = '';
      noteEl.value = '';
      var successBox = document.getElementById('order-success');
      successBox.style.display = 'block';
      successBox.innerHTML = '<strong>Order received.</strong><br>We\'ll message you on Discord once the delivery is ready.';
    });
  });

  loadAndRenderCart();
})();
