(function () {
  var escapeHtml = AtlasCommon.escapeHtml;
  var fmtPrice = AtlasCommon.fmtPrice;
  var api = AtlasCommon.api;
  function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

  // ---------- SESSION / LOGIN ----------
  function checkSession() {
    api('/api/session').then(function (res) {
      if (res.data && res.data.is_admin) {
        showPanel();
      } else {
        showLock();
      }
    });
  }

  function showPanel() {
    document.getElementById('admin-lock').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    renderAdmin();
  }

  function showLock() {
    document.getElementById('admin-lock').style.display = 'block';
    document.getElementById('admin-panel').style.display = 'none';
  }

  function doLogin() {
    var pwEl = document.getElementById('admin-password');
    var err = document.getElementById('err-password');
    err.textContent = '';
    var password = pwEl.value;
    if (!password) {
      err.textContent = 'Please enter a password.';
      return;
    }
    api('/api/login', { method: 'POST', body: JSON.stringify({ password: password }) }).then(function (res) {
      if (res.ok) {
        pwEl.value = '';
        showPanel();
      } else {
        err.textContent = (res.data && res.data.error) || 'Incorrect password.';
      }
    });
  }

  var loginBtn = document.getElementById('admin-login-btn');
  loginBtn.addEventListener('click', doLogin);
  document.getElementById('admin-password').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLogin();
  });

  document.getElementById('logout-btn').addEventListener('click', function () {
    api('/api/logout', { method: 'POST' }).then(function () {
      showLock();
    });
  });

  document.getElementById('change-password-btn').addEventListener('click', function () {
    var newPwEl = document.getElementById('new-password');
    var err = document.getElementById('err-new-password');
    err.textContent = '';
    api('/api/admin/password', { method: 'POST', body: JSON.stringify({ password: newPwEl.value }) }).then(function (res) {
      if (res.ok) {
        newPwEl.value = '';
        alert('Password changed.');
      } else {
        err.textContent = (res.data && res.data.error) || 'Could not change password.';
      }
    });
  });

  // ---------- PRODUCTS ----------
  document.getElementById('add-product-btn').addEventListener('click', function () {
    var nameEl = document.getElementById('new-name');
    var unitEl = document.getElementById('new-unit');
    var priceEl = document.getElementById('new-price');
    var stockEl = document.getElementById('new-stock');
    var err = document.getElementById('err-new-product');
    err.textContent = '';

    api('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify({
        name: nameEl.value.trim(),
        unit: unitEl.value.trim(),
        price: priceEl.value,
        stock: stockEl.value
      })
    }).then(function (res) {
      if (!res.ok) {
        err.textContent = (res.data && res.data.error) || 'Please provide name, unit, and a valid price.';
        return;
      }
      nameEl.value = '';
      unitEl.value = '';
      priceEl.value = '';
      stockEl.value = 'in';
      renderProducts();
    });
  });

  function renderProducts() {
    api('/api/products').then(function (res) {
      var products = res.data || [];
      var body = document.getElementById('admin-product-body');
      body.innerHTML = '';
      products.forEach(function (p) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td><input type="text" value="' + escapeAttr(p.name) + '" data-field="name" data-id="' + p.id + '"></td>' +
          '<td><input type="text" value="' + escapeAttr(p.unit) + '" data-field="unit" data-id="' + p.id + '"></td>' +
          '<td><input type="number" value="' + p.price + '" min="0" step="1" data-field="price" data-id="' + p.id + '"></td>' +
          '<td><select data-field="stock" data-id="' + p.id + '">' +
            '<option value="in"' + (p.stock === 'in' ? ' selected' : '') + '>In stock</option>' +
            '<option value="low"' + (p.stock === 'low' ? ' selected' : '') + '>Low stock</option>' +
            '<option value="out"' + (p.stock === 'out' ? ' selected' : '') + '>Out of stock</option>' +
          '</select></td>' +
          '<td><button class="btn danger small" data-remove="' + p.id + '">Delete</button></td>';
        body.appendChild(tr);
      });

      body.querySelectorAll('[data-field]').forEach(function (el) {
        el.addEventListener('change', function () {
          var id = el.dataset.id;
          var field = el.dataset.field;
          var payload = {};
          payload[field] = el.value;
          api('/api/admin/products/' + id, { method: 'PATCH', body: JSON.stringify(payload) });
        });
      });

      body.querySelectorAll('[data-remove]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          api('/api/admin/products/' + btn.dataset.remove, { method: 'DELETE' }).then(function () {
            renderProducts();
          });
        });
      });
    });
  }

  // ---------- DELIVERY REGIONS ----------
  document.getElementById('add-region-btn').addEventListener('click', function () {
    var labelEl = document.getElementById('new-region-label');
    var latEl = document.getElementById('new-region-lat');
    var lonEl = document.getElementById('new-region-lon');
    var radiusEl = document.getElementById('new-region-radius');
    var err = document.getElementById('err-new-region');
    err.textContent = '';

    api('/api/admin/delivery-regions', {
      method: 'POST',
      body: JSON.stringify({
        label: labelEl.value.trim(),
        lat: latEl.value,
        lon: lonEl.value,
        radius_km: radiusEl.value || 30
      })
    }).then(function (res) {
      if (!res.ok) {
        err.textContent = (res.data && res.data.error) || 'Please provide a location, valid coordinates, and radius.';
        return;
      }
      labelEl.value = '';
      latEl.value = '';
      lonEl.value = '';
      radiusEl.value = '30';
      renderRegions();
    });
  });

  function renderRegions() {
    api('/api/delivery-regions').then(function (res) {
      var regions = res.data || [];
      var body = document.getElementById('admin-region-body');
      body.innerHTML = '';
      regions.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td><input type="text" value="' + escapeAttr(r.label) + '" data-region-field="label" data-region-id="' + r.id + '"></td>' +
          '<td><input type="number" value="' + r.lat + '" step="0.0001" data-region-field="lat" data-region-id="' + r.id + '"></td>' +
          '<td><input type="number" value="' + r.lon + '" step="0.0001" data-region-field="lon" data-region-id="' + r.id + '"></td>' +
          '<td><input type="number" value="' + r.radius_km + '" step="1" min="1" data-region-field="radius_km" data-region-id="' + r.id + '"></td>' +
          '<td><button class="btn danger small" data-remove-region="' + r.id + '">Delete</button></td>';
        body.appendChild(tr);
      });

      body.querySelectorAll('[data-region-field]').forEach(function (el) {
        el.addEventListener('change', function () {
          var id = el.dataset.regionId;
          var field = el.dataset.regionField;
          var payload = {};
          payload[field] = el.value;
          api('/api/admin/delivery-regions/' + id, { method: 'PATCH', body: JSON.stringify(payload) });
        });
      });

      body.querySelectorAll('[data-remove-region]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          api('/api/admin/delivery-regions/' + btn.dataset.removeRegion, { method: 'DELETE' }).then(function () {
            renderRegions();
          });
        });
      });
    });
  }

  // ---------- ORDERS ----------
  function renderOrders() {
    api('/api/admin/orders').then(function (res) {
      var orders = res.data || [];
      var ordersBox = document.getElementById('admin-orders');
      if (orders.length === 0) {
        ordersBox.innerHTML = '<div class="empty-msg">No orders received yet.</div>';
        return;
      }
      ordersBox.innerHTML = orders.map(function (o) {
        var itemsHtml = o.items.map(function (it) {
          return escapeHtml(it.name) + ' x' + it.qty + ' (' + fmtPrice(it.price * it.qty) + ')';
        }).join(', ');
        var pillClass = o.status === 'done' ? 'status-done' : 'status-new';
        var pillLabel = o.status === 'done' ? 'Done' : 'New';
        return '<div class="cart-box" style="margin-top:0.8rem;">' +
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
            '<strong>' + escapeHtml(o.customer_name) + '</strong>' +
            '<span class="status-pill ' + pillClass + '">' + pillLabel + '</span>' +
          '</div>' +
          '<div style="color:var(--text-dim); font-size:0.82rem; margin:0.3rem 0;">Contact: ' + escapeHtml(o.contact) + ' &middot; ' + o.created_at + '</div>' +
          '<div style="font-size:0.9rem;">' + itemsHtml + '</div>' +
          (o.note ? '<div style="font-size:0.85rem; margin-top:0.3rem; color:var(--text-dim);">Note: ' + escapeHtml(o.note) + '</div>' : '') +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem;">' +
            '<strong>' + fmtPrice(o.total) + '</strong>' +
            '<button class="btn small ' + (o.status === 'done' ? 'secondary' : '') + '" data-toggle="' + o.id + '" data-status="' + o.status + '">' +
              (o.status === 'done' ? 'Mark as new' : 'Mark as done') +
            '</button>' +
          '</div>' +
        '</div>';
      }).join('');

      ordersBox.querySelectorAll('[data-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var newStatus = btn.dataset.status === 'done' ? 'new' : 'done';
          api('/api/admin/orders/' + btn.dataset.toggle, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) }).then(function () {
            renderOrders();
          });
        });
      });
    });
  }

  function renderAdmin() {
    renderProducts();
    renderRegions();
    renderOrders();
  }

  checkSession();
})();
