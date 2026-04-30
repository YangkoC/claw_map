/**
 * 主应用控制器：协调地图、列表、提交表单
 */

var App = (function () {
  'use strict';

  var spots = [];           // 所有已审核钓点
  var currentTab = 'map';   // 当前激活的标签页
  var isLoading = false;
  var searchKeyword = '';   // 当前搜索关键词

  /**
   * 应用入口：初始化所有模块
   */
  function boot(config) {
    config = config || {};

    // 显示加载状态
    _showLoading(true);

    // 1. 初始化 Supabase
    DB.init(config.supabase);

    // 2. 绑定标签切换（不依赖地图，始终可用）
    _bindTabs();

    // 3. 初始化提交模块（不依赖地图）
    SubmitModule.init('submit-container');

    // 4. 初始化高德地图（异步）
    MapModule.init(config.amap).then(function (userPos) {
      _showLoading(false);
      _loadSpots();
    }).catch(function (err) {
      _showLoading(false);
      // 地图加载失败时自动切到列表视图
      switchTab('list');
      console.error('地图加载失败:', err);
      _showError('地图加载失败，可切换列表查看钓点');
    });
  }

  /**
   * 从 LeanCloud 拉取钓点并渲染
   */
  function _loadSpots() {
    isLoading = true;
    _showListLoading(true);

    DB.fetchApprovedSpots().then(function (data) {
      spots = data || [];
      _renderAll();
      isLoading = false;
      _showListLoading(false);
    }).catch(function (err) {
      spots = [];
      _renderAll();
      isLoading = false;
      _showListLoading(false);
      _showError('加载钓点数据失败，请刷新重试');
    });
  }

  /**
   * 获取当前应该显示的钓点列表
   */
  function _getVisibleSpots() {
    if (!searchKeyword) return spots;
    var kw = searchKeyword.toLowerCase();
    return spots.filter(function (s) {
      return (s.name && s.name.toLowerCase().indexOf(kw) !== -1)
        || (s.address && s.address.toLowerCase().indexOf(kw) !== -1)
        || (s.description && s.description.toLowerCase().indexOf(kw) !== -1);
    });
  }

  /**
   * 根据当前标签页渲染页面
   */
  function _renderAll() {
    _renderMapMarkers();
    _renderSpotList();
  }

  /**
   * 搜索过滤钓点
   * @param {string} keyword
   */
  function filterSpots(keyword) {
    searchKeyword = (keyword || '').trim();
    _renderAll();
    if (currentTab !== 'map') {
      switchTab('list');
    }
  }

  /**
   * 在地图上渲染标记（附带距离排序）
   */
  function _renderMapMarkers() {
    var userPos = MapModule.getUserPosition();

    // 计算距离并排序
    var visible = _getVisibleSpots();
    var spotsWithDist = visible.map(function (s) {
      var dist = userPos
        ? MapModule.calculateDistance(userPos.latitude, userPos.longitude, s.latitude, s.longitude)
        : Infinity;
      return { spot: s, distance: dist };
    });

    // 按距离排序
    spotsWithDist.sort(function (a, b) { return a.distance - b.distance; });

    MapModule.renderMarkers(
      spotsWithDist.map(function (s) { return s.spot; }),
      function (spot) {
        // 点击标记时同步高亮列表项
        _highlightListItem(spot.objectId);
      }
    );
  }

  /**
   * 渲染底部钓点列表
   */
  function _renderSpotList() {
    var listEl = document.getElementById('spot-list');
    if (!listEl) return;

    var userPos = MapModule.getUserPosition();

    var visible = _getVisibleSpots();

    if (visible.length === 0) {
      listEl.innerHTML = searchKeyword
        ? '<p class="list-empty">没有匹配"<b>' + _escapeHtml(searchKeyword) + '</b>"的钓点</p>'
        : '<p class="list-empty">还没有钓点数据<br>点击"提交"添加第一个钓点吧！</p>';
      return;
    }

    // 计算距离并排序
    var spotsWithDist = visible.map(function (s) {
      var dist = userPos
        ? MapModule.calculateDistance(userPos.latitude, userPos.longitude, s.latitude, s.longitude)
        : Infinity;
      return { spot: s, distance: dist };
    });
    spotsWithDist.sort(function (a, b) { return a.distance - b.distance; });

    var html = '';
    spotsWithDist.forEach(function (item) {
      var distText = item.distance === Infinity
        ? '未知'
        : MapModule.formatDistance(item.distance);

      html += '<div class="spot-item" data-id="' + item.spot.objectId + '">'
        + '<div class="spot-item-main">'
        + '<span class="spot-item-name">' + _escapeHtml(item.spot.name) + '</span>'
        + '<span class="spot-item-addr">' + _escapeHtml(item.spot.address || '') + '</span>'
        + '</div>'
        + '<div class="spot-item-distance">' + distText + '</div>'
        + '</div>';
    });

    listEl.innerHTML = html;

    // 绑定点击：切换到地图并定位
    listEl.querySelectorAll('.spot-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = this.dataset.id;
        var spot = spots.find(function (s) { return String(s.objectId) === id; });
        if (spot) {
          switchTab('map');
          setTimeout(function () {
            MapModule.selectSpot(spot);
          }, 150);
        }
      });
    });
  }

  /**
   * 高亮列表中的某一项
   */
  function _highlightListItem(objectId) {
    var listEl = document.getElementById('spot-list');
    if (!listEl) return;
    listEl.querySelectorAll('.spot-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.id === String(objectId));
    });
  }

  /**
   * 绑定底部标签切换
   */
  function _bindTabs() {
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var tabName = this.dataset.tab;
        if (tabName === 'submit') {
          SubmitModule.show();
          return;
        }
        switchTab(tabName);
      });
    });
  }

  /**
   * 切换标签页
   */
  function switchTab(tabName) {
    currentTab = tabName;

    // 更新标签激活状态
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });

    // 切换内容区域
    var mapContainer = document.getElementById('map-container');
    var listContainer = document.getElementById('list-container');

    if (tabName === 'map') {
      mapContainer.style.display = 'block';
      listContainer.style.display = 'none';
      // 从列表切回地图时需要重新计算地图尺寸
      MapModule.resize();
    } else if (tabName === 'list') {
      mapContainer.style.display = 'none';
      listContainer.style.display = 'block';
      _renderSpotList();
    }
  }

  /**
   * 钓点提交成功后的回调（由 SubmitModule 调用）
   */
  window.onSpotSubmitted = function () {
    _loadSpots();
  };

  /**
   * 显示/隐藏加载状态
   */
  function _showLoading(show) {
    var el = document.getElementById('loading-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  function _showListLoading(show) {
    var el = document.getElementById('list-loading');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  function _showError(msg) {
    // 简单的 toast 提示
    var toast = document.createElement('div');
    toast.className = 'toast-error';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add('show'); }, 10);
    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { document.body.removeChild(toast); }, 300);
    }, 3000);
  }

  function _escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ========== 公开 API ==========
  return {
    boot: boot,
    switchTab: switchTab,
    reloadSpots: _loadSpots,
    filterSpots: filterSpots
  };
})();
