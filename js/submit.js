/**
 * 提交钓点模块：表单渲染、校验、提交、地理位置选取
 */

var SubmitModule = (function () {
  'use strict';

  var formEl = null;
  var selectedPosition = null;
  var selectedAddress = '';
  var uploadedImageUrls = [];
  var isSubmitting = false;
  var pickerMap = null;
  var pickerMarker = null;
  var pickerMapReady = false;

  /**
   * 初始化提交表单
   * @param {string} containerId - 表单容器 DOM ID
   */
  function init(containerId) {
    formEl = document.getElementById(containerId);
    if (!formEl) return;

    _renderForm();
    _bindEvents();
  }

  function _renderForm() {
    formEl.innerHTML = ''
      + '<div class="submit-overlay" id="submit-overlay">'
      + '  <div class="submit-panel">'
      + '    <div class="submit-header">'
      + '      <h3>提交新钓点</h3>'
      + '      <button class="submit-close" id="btn-close-submit">&times;</button>'
      + '    </div>'
      + '    <div class="submit-body">'
      + '      <!-- 名称 -->'
      + '      <div class="form-group">'
      + '        <label>钓点名称 <span class="required">*</span></label>'
      + '        <input type="text" id="spot-name" placeholder="如：XX村王大爷虾塘" maxlength="50">'
      + '      </div>'
      + '      <!-- 位置选取 -->'
      + '      <div class="form-group">'
      + '        <label>位置 <span class="required">*</span></label>'
      + '        <div class="location-picker" id="location-picker">'
      + '          <div id="picker-map" class="picker-map"></div>'
      + '          <p class="location-hint">👆 点击上方地图选择钓点位置，选点后地址会自动填充</p>'
      + '          <p class="selected-location" id="selected-location" style="display:none"></p>'
      + '        </div>'
      + '      </div>'
      + '      <!-- 地址 -->'
      + '      <div class="form-group">'
      + '        <label>详细地址</label>'
      + '        <input type="text" id="spot-address" placeholder="自动填充，可手动修改" maxlength="100">'
      + '      </div>'
      + '      <!-- 描述 -->'
      + '      <div class="form-group">'
      + '        <label>描述</label>'
      + '        <textarea id="spot-desc" rows="3" placeholder="价格、水深、虾大小、停车情况等..." maxlength="500"></textarea>'
      + '      </div>'
      + '      <!-- 联系方式 -->'
      + '      <div class="form-group">'
      + '        <label>联系方式</label>'
      + '        <input type="text" id="spot-contact" placeholder="电话/微信（选填）" maxlength="30">'
      + '      </div>'
      + '      <!-- 标签 -->'
      + '      <div class="form-group">'
      + '        <label>标签</label>'
      + '        <div class="tag-options" id="tag-options">'
      + '          <label><input type="checkbox" value="野塘"> 野塘</label>'
      + '          <label><input type="checkbox" value="收费"> 收费</label>'
      + '          <label><input type="checkbox" value="斤塘"> 斤塘（按斤收费）</label>'
      + '          <label><input type="checkbox" value="天塘"> 天塘（按天收费）</label>'
      + '          <label><input type="checkbox" value="新手友好"> 新手友好</label>'
      + '          <label><input type="checkbox" value="虾多"> 虾多</label>'
      + '        </div>'
      + '      </div>'
      + '      <!-- 图片 -->'
      + '      <div class="form-group">'
      + '        <label>图片（选填）</label>'
      + '        <input type="file" id="spot-images" accept="image/*" multiple>'
      + '        <div id="image-preview" class="image-preview"></div>'
      + '        <p class="form-hint">最多 3 张，每张不超过 5MB</p>'
      + '      </div>'
      + '    </div>'
      + '    <div class="submit-footer">'
      + '      <button class="btn btn-cancel" id="btn-cancel-submit">取消</button>'
      + '      <button class="btn btn-primary" id="btn-submit-spot">提交（需审核）</button>'
      + '    </div>'
      + '    <div id="submit-message" class="submit-message"></div>'
      + '  </div>'
      + '</div>';
  }

  function _bindEvents() {
    var overlay = document.getElementById('submit-overlay');

    // 关闭/取消
    document.getElementById('btn-close-submit').addEventListener('click', hide);
    document.getElementById('btn-cancel-submit').addEventListener('click', hide);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hide();
    });

    // 提交
    document.getElementById('btn-submit-spot').addEventListener('click', _handleSubmit);

    // 图片预览
    document.getElementById('spot-images').addEventListener('change', _handleImagePreview);

    // 选点小地图 + 搜索提示都延迟到第一次 show() 时初始化（需等 AMap SDK 加载完）
  }

  function _initPickerMap() {
    var pickerDiv = document.getElementById('picker-map');
    var userPos = MapModule.getUserPosition();
    var center = userPos
      ? [userPos.longitude, userPos.latitude]
      : [116.397428, 39.90923];
    var zoom = userPos ? 14 : 12;

    pickerMap = new AMap.Map(pickerDiv, {
      zoom: zoom,
      center: center,
      resizeEnable: true
    });

    // 如果没有用户位置，尝试浏览器定位
    if (!userPos) {
      pickerMap.plugin('AMap.Geolocation', function () {
        var geoloc = new AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 8000,
          buttonPosition: 'RB',
          buttonOffset: new AMap.Pixel(10, 10),
          zoomToAccuracy: true
        });
        pickerMap.addControl(geoloc);
        geoloc.getCurrentPosition();
      });
    }

    pickerMap.on('click', function (e) {
      var lng = e.lnglat.getLng();
      var lat = e.lnglat.getLat();

      selectedPosition = { latitude: lat, longitude: lng };

      // 更新标记
      if (pickerMarker) {
        pickerMarker.setPosition([lng, lat]);
      } else {
        pickerMarker = new AMap.Marker({
          position: [lng, lat],
          map: pickerMap,
          icon: new AMap.Icon({
            size: new AMap.Size(25, 34),
            image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png',
            imageSize: new AMap.Size(25, 34)
          })
        });
      }

      // 逆地理编码获取地址
      MapModule.reverseGeocode(lng, lat, function (err, address) {
        if (!err) {
          selectedAddress = address;
          document.getElementById('spot-address').value = address;
          document.getElementById('selected-location').textContent
            = '已选: ' + lng.toFixed(6) + ', ' + lat.toFixed(6) + ' (' + address + ')';
          document.getElementById('selected-location').style.display = 'block';
        }
      });
    });
  }

  function _renderSearchResults(pois) {
    var container = document.getElementById('search-results');
    if (!pois || pois.length === 0) {
      container.innerHTML = '<p class="no-result">未找到，请点击地图选点</p>';
      return;
    }

    var html = '';
    pois.forEach(function (poi) {
      html += '<div class="search-result-item" data-lng="' + poi.location.lng
        + '" data-lat="' + poi.location.lat
        + '" data-address="' + _escapeAttr(poi.pname + poi.cityname + poi.adname + poi.name)
        + '">'
        + '<span class="poi-name">' + _escapeHtml(poi.name) + '</span>'
        + '<span class="poi-addr">' + _escapeHtml(poi.pname + poi.cityname + poi.adname) + '</span>'
        + '</div>';
    });
    container.innerHTML = html;

    // 绑定点击事件
    container.querySelectorAll('.search-result-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var lng = parseFloat(this.dataset.lng);
        var lat = parseFloat(this.dataset.lat);
        selectedPosition = { latitude: lat, longitude: lng };
        selectedAddress = this.dataset.address;

        document.getElementById('spot-address').value = selectedAddress;
        document.getElementById('selected-location').textContent
          = '已选: ' + lng.toFixed(6) + ', ' + lat.toFixed(6) + ' (' + selectedAddress + ')';
        document.getElementById('selected-location').style.display = 'block';
        container.innerHTML = '';
      });
    });
  }

  function _handleImagePreview() {
    var files = this.files;
    var preview = document.getElementById('image-preview');
    preview.innerHTML = '';

    if (!files || files.length === 0) return;

    var count = Math.min(files.length, 3);
    for (var i = 0; i < count; i++) {
      if (files[i].size > 5 * 1024 * 1024) {
        preview.innerHTML = '<p class="error">图片不能超过 5MB</p>';
        this.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = (function (imgEl) {
        return function (e) {
          imgEl.src = e.target.result;
        };
      })(document.createElement('img'));
      var img = document.createElement('img');
      img.className = 'preview-thumb';
      reader.readAsDataURL(files[i]);
      preview.appendChild(img);
    }
  }

  function _handleSubmit() {
    if (isSubmitting) return;

    // 校验
    var name = document.getElementById('spot-name').value.trim();
    if (!name) {
      _showMessage('请填写钓点名称', 'error');
      return;
    }
    if (!selectedPosition) {
      _showMessage('请在地图上选择位置或搜索地点', 'error');
      return;
    }

    var address = document.getElementById('spot-address').value.trim()
      || selectedAddress;
    var description = document.getElementById('spot-desc').value.trim();
    var contact = document.getElementById('spot-contact').value.trim();

    // 收集标签
    var tags = [];
    document.querySelectorAll('#tag-options input:checked').forEach(function (cb) {
      tags.push(cb.value);
    });

    // 先上传图片，再提交数据
    isSubmitting = true;
    _showMessage('正在提交...', 'info');

    var imageFiles = document.getElementById('spot-images').files;
    var uploadPromise = (imageFiles && imageFiles.length > 0)
      ? DB.uploadImages(imageFiles)
      : Promise.resolve([]);

    uploadPromise.then(function (urls) {
      return DB.submitSpot({
        name: name,
        latitude: selectedPosition.latitude,
        longitude: selectedPosition.longitude,
        address: address,
        description: description,
        contact: contact,
        tags: tags,
        images: urls
      });
    }).then(function () {
      _showMessage('提交成功！审核通过后将在地图上显示', 'success');
      _resetForm();
      isSubmitting = false;
      // 触发回调通知主应用
      if (typeof onSpotSubmitted === 'function') onSpotSubmitted();
    }).catch(function (err) {
      var msg = '提交失败: ';
      if (err && err.message) msg += err.message;
      else if (err && err.error) msg += err.error;
      else msg += '网络错误，请稍后再试';
      _showMessage(msg, 'error');
      isSubmitting = false;
    });
  }

  function _resetForm() {
    document.getElementById('spot-name').value = '';
    document.getElementById('spot-address').value = '';
    document.getElementById('spot-desc').value = '';
    document.getElementById('spot-contact').value = '';
    document.getElementById('spot-images').value = '';
    document.getElementById('image-preview').innerHTML = '';
    document.getElementById('selected-location').style.display = 'none';
    document.querySelectorAll('#tag-options input').forEach(function (cb) {
      cb.checked = false;
    });
    selectedPosition = null;
    selectedAddress = '';
    uploadedImageUrls = [];
  }

  function _showMessage(msg, type) {
    var el = document.getElementById('submit-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'submit-message ' + (type || 'info');
    if (type === 'success') {
      setTimeout(function () { el.textContent = ''; el.className = 'submit-message'; }, 4000);
    }
  }

  function _escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function _escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/&/g, '&amp;');
  }

  /**
   * 显示提交表单
   */
  function show() {
    var overlay = document.getElementById('submit-overlay');
    if (overlay) overlay.style.display = 'flex';
    _resetForm();

    // 选点小地图延迟初始化（等 AMap SDK 加载完）
    if (!pickerMapReady) {
      pickerMapReady = true;
      if (typeof AMap !== 'undefined') {
        _initPickerMap();
      } else {
        var checkInterval = setInterval(function () {
          if (typeof AMap !== 'undefined') {
            clearInterval(checkInterval);
            _initPickerMap();
          }
        }, 200);
        setTimeout(function () { clearInterval(checkInterval); }, 10000);
      }
    }

    // 修复小地图尺寸并定位
    setTimeout(function () {
      if (pickerMap) {
        pickerMap.resize();
        var userPos = MapModule.getUserPosition();
        if (userPos) {
          pickerMap.setCenter([userPos.longitude, userPos.latitude]);
          pickerMap.setZoom(14);
        }
        if (pickerMarker) {
          pickerMarker.setMap(null);
          pickerMarker = null;
        }
      }
    }, 300);
  }

  /**
   * 隐藏提交表单
   */
  function hide() {
    var overlay = document.getElementById('submit-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ========== 公开 API ==========
  return {
    init: init,
    show: show,
    hide: hide
  };
})();
