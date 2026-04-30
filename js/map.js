/**
 * 高德地图模块：初始化地图、渲染钓点标记、计算距离
 *
 * 使用前需在高德开放平台申请 Key 并填写到 CONFIG 中
 */

var MapModule = (function () {
  'use strict';

  // ========== 配置 ==========
  var CONFIG = {
    amapKey: 'YOUR_AMAP_KEY',           // 高德 JS API Key
    amapSecurityJsCode: 'YOUR_AMAP_SECURITY_CODE', // 高德安全密钥（2.0 必需）
    mapContainerId: 'map-container',
    markerIcon: 'assets/marker-icon.png' // 自定义标记图标（可选）
  };

  var map = null;           // 地图实例
  var geolocation = null;   // 定位插件
  var markers = [];         // 当前地图上的标记
  var infoWindow = null;    // 信息窗体
  var userPosition = null;  // 用户位置 { latitude, longitude }

  /**
   * 初始化高德地图
   * @param {Object} configOverride
   * @returns {Promise} 在地图加载完成且定位成功后 resolve
   */
  function init(configOverride) {
    // 合并默认配置和外部配置
    var cfg = {};
    var src = configOverride || CONFIG;
    for (var key in CONFIG) { cfg[key] = CONFIG[key]; }
    if (configOverride) {
      for (var key in configOverride) { cfg[key] = configOverride[key]; }
    }

    var promise = new Promise(function (resolve, reject) {
      // 安全密钥配置（必须在 script 加载前设置）
      window._AMapSecurityConfig = {
        securityJsCode: cfg.amapSecurityJsCode
      };

      // 动态加载高德 JS API
      var script = document.createElement('script');
      script.src = 'https://webapi.amap.com/maps?v=2.0'
        + '&key=' + encodeURIComponent(cfg.amapKey)
        + '&plugin=AMap.Geolocation,AMap.Geocoder,AMap.AutoComplete,AMap.PlaceSearch';
      script.onload = function () {
        _initMap(cfg).then(resolve).catch(reject);
      };
      script.onerror = function () {
        reject(new Error('高德地图 JS 加载失败，请检查网络'));
      };
      document.head.appendChild(script);
    });

    return promise;
  }

  /**
   * 创建地图实例 + 定位
   */
  function _initMap(cfg) {
    return new Promise(function (resolve, reject) {
      try {
        map = new AMap.Map(cfg.mapContainerId, {
          zoom: 13,
          center: [116.397428, 39.90923],
          resizeEnable: true
        });

        // 初始化定位
        geolocation = new AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 10000,
          buttonPosition: 'RB',
          buttonOffset: new AMap.Pixel(10, 80),
          zoomToAccuracy: true
        });
        map.addControl(geolocation);

        // 初始化信息窗体
        infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -30) });

        // 尝试获取用户位置
        geolocation.getCurrentPosition(function (status, result) {
          if (status === 'complete' && result.position) {
            userPosition = {
              latitude: result.position.lat,
              longitude: result.position.lng
            };
            map.setCenter([userPosition.longitude, userPosition.latitude]);
            map.setZoom(14);
            resolve(userPosition);
          } else {
            userPosition = null;
            resolve(null);
          }
        });
      } catch (err) {
        reject(new Error('地图创建失败: ' + (err.message || err)));
      }
    });
  }

  /**
   * 获取用户当前位置
   * @returns {{ latitude: number, longitude: number }|null}
   */
  function getUserPosition() {
    return userPosition;
  }

  /**
   * Haversine 公式计算两点距离
   * @returns {number} 距离（公里）
   */
  function calculateDistance(lat1, lng1, lat2, lng2) {
    var R = 6371; // 地球半径（km）
    var dLat = _toRad(lat2 - lat1);
    var dLng = _toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(_toRad(lat1)) * Math.cos(_toRad(lat2))
      * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function _toRad(deg) {
    return deg * Math.PI / 180;
  }

  /**
   * 格式化距离显示
   */
  function formatDistance(km) {
    if (km < 1) {
      return Math.round(km * 1000) + 'm';
    }
    if (km < 100) {
      return km.toFixed(1) + 'km';
    }
    return Math.round(km) + 'km';
  }

  /**
   * 在地图上渲染钓点标记
   * @param {Array} spots - 钓点数组
   * @param {Function} onMarkerClick - 点击标记回调，参数为钓点对象
   */
  function renderMarkers(spots, onMarkerClick) {
    clearMarkers();

    if (!spots || spots.length === 0) return;

    var markerList = [];
    spots.forEach(function (spot) {
      var marker = new AMap.Marker({
        position: [spot.longitude, spot.latitude],
        title: spot.name,
        icon: new AMap.Icon({
          size: new AMap.Size(32, 40),
          image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png',
          imageSize: new AMap.Size(32, 40)
        }),
        anchor: 'bottom-center',
        offset: new AMap.Pixel(0, 0)
      });

      // 存自定义数据
      marker._spotData = spot;

      marker.on('click', function () {
        _showSpotDetail(spot);
        if (onMarkerClick) onMarkerClick(spot);
      });

      markerList.push(marker);
    });

    markers = markerList;
    map.add(markers);

    // 自适应显示所有标记
    map.setFitView(null, false, [60, 60, 60, 60]);
  }

  /**
   * 显示钓点详情信息窗体
   */
  function _showSpotDetail(spot) {
    var tagsHtml = '';
    if (spot.tags && spot.tags.length > 0) {
      tagsHtml = '<div class="info-tags">'
        + spot.tags.map(function (t) {
          return '<span class="info-tag">' + _escapeHtml(t) + '</span>';
        }).join('')
        + '</div>';
    }

    var imagesHtml = '';
    if (spot.images && spot.images.length > 0) {
      imagesHtml = '<div class="info-images">'
        + spot.images.map(function (url) {
          return '<img src="' + _escapeHtml(url) + '" alt="" class="info-img">';
        }).join('')
        + '</div>';
    }

    var distanceHtml = '';
    if (userPosition) {
      var dist = calculateDistance(
        userPosition.latitude, userPosition.longitude,
        spot.latitude, spot.longitude
      );
      distanceHtml = '<span class="info-distance">距你 ' + formatDistance(dist) + '</span>';
    }

    var content = '<div class="info-window">'
      + '<h4 class="info-name">' + _escapeHtml(spot.name) + distanceHtml + '</h4>'
      + '<p class="info-address">' + _escapeHtml(spot.address || '地址未填写') + '</p>'
      + (spot.description
        ? '<p class="info-desc">' + _escapeHtml(spot.description) + '</p>'
        : '')
      + (spot.contact
        ? '<p class="info-contact">联系电话: ' + _escapeHtml(spot.contact) + '</p>'
        : '')
      + tagsHtml
      + imagesHtml
      + '</div>';

    infoWindow.setContent(content);
    infoWindow.open(map, [spot.longitude, spot.latitude]);
  }

  /**
   * 选中某个钓点（从列表点击时调用）
   */
  function selectSpot(spot) {
    map.setCenter([spot.longitude, spot.latitude]);
    map.setZoom(16);
    _showSpotDetail(spot);
  }

  /**
   * 搜索地点（用来帮助用户选位置）
   */
  function searchPlace(keyword, callback) {
    try {
      var placeSearch = new AMap.PlaceSearch({
        pageSize: 5,
        pageIndex: 1,
        citylimit: false,
        extensions: 'all'
      });
      placeSearch.search(keyword, function (status, result) {
        if (status === 'complete' && result) {
          var pois = result.pois || [];
          if (pois.length > 0) {
            callback(null, pois);
          } else {
            // 尝试从其他可能的字段获取
            var altPois = result.tips || result.suggestionList || [];
            if (altPois.length > 0) {
              callback(null, altPois);
            } else {
              callback(new Error('未找到匹配地点，请点击地图选点'), null);
            }
          }
        } else {
          callback(new Error('搜索失败'), null);
        }
      });
    } catch (err) {
      callback(new Error('搜索服务不可用'), null);
    }
  }

  /**
   * 获取地址文字描述（逆地理编码）
   */
  function reverseGeocode(lng, lat, callback) {
    var geocoder = new AMap.Geocoder();
    geocoder.getAddress([lng, lat], function (status, result) {
      if (status === 'complete') {
        callback(null, result.regeocode.formattedAddress);
      } else {
        callback(new Error('获取地址失败'), null);
      }
    });
  }

  /**
   * 清除所有标记
   */
  function clearMarkers() {
    if (markers.length > 0) {
      map.remove(markers);
      markers = [];
    }
  }

  /**
   * 销毁地图实例
   */
  /**
   * 触发地图重新计算尺寸（切换标签后调用）
   */
  function resize() {
    if (map) {
      map.resize();
    }
  }

  function destroy() {
    clearMarkers();
    if (map) {
      map.destroy();
      map = null;
    }
  }

  function _escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ========== 公开 API ==========
  return {
    init: init,
    getUserPosition: getUserPosition,
    calculateDistance: calculateDistance,
    formatDistance: formatDistance,
    renderMarkers: renderMarkers,
    selectSpot: selectSpot,
    searchPlace: searchPlace,
    reverseGeocode: reverseGeocode,
    clearMarkers: clearMarkers,
    resize: resize,
    destroy: destroy,
    getConfig: function () { return CONFIG; }
  };
})();
