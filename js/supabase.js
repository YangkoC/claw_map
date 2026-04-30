/**
 * Supabase 数据层：初始化、查询、新增钓点、上传图片
 *
 * 替代已停止注册的 LeanCloud，使用 Supabase 免费层
 *
 * 使用前需在 Supabase 控制台：
 * 1. 创建 spots 表（SQL 见 README）
 * 2. 创建 spot-images 存储桶
 * 3. 设置 RLS 策略（允许公开读写）
 */

var DB = (function () {
  'use strict';

  // ========== 默认配置 ==========
  var CONFIG = {
    supabaseUrl: 'YOUR_SUPABASE_URL',           // 如 https://xxxxxxxxxxxx.supabase.co
    supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY'   // Supabase 控制台 → Settings → API → anon/public key
  };

  var client = null;
  var initialized = false;

  /**
   * 初始化 Supabase 客户端
   */
  function init(configOverride) {
    if (initialized) return;

    var cfg = configOverride || CONFIG;

    // 使用 Supabase SDK 的全局 supabase 对象
    client = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      db: { schema: 'public' }
    });

    initialized = true;
  }

  /**
   * 获取所有已审核通过的钓点（当前年份）
   * Supabase 默认每页 1000 条，需要分页获取更多
   */
  function fetchApprovedSpots(year) {
    if (!initialized) throw new Error('Supabase 未初始化');

    var targetYear = year || new Date().getFullYear();
    return _fetchAll(function (rangeStart, rangeEnd) {
      return client
        .from('spots')
        .select('*')
        .eq('status', 'approved')
        .eq('year', targetYear)
        .order('created_at', { ascending: false })
        .range(rangeStart, rangeEnd);
    });
  }

  /**
   * 分页拉取所有数据
   */
  function _fetchAll(queryFn, accumulated) {
    accumulated = accumulated || [];
    var pageSize = 1000;
    var rangeStart = accumulated.length;
    var rangeEnd = rangeStart + pageSize - 1;

    return queryFn(rangeStart, rangeEnd).then(function (result) {
      var error = result.error;
      var data = result.data;

      if (error) throw error;

      accumulated = accumulated.concat(data || []);

      if ((data || []).length < pageSize) {
        return accumulated.map(_formatSpot);
      }
      return _fetchAll(queryFn, accumulated);
    });
  }

  /**
   * 提交新钓点（状态为 pending）
   */
  function submitSpot(data) {
    if (!initialized) throw new Error('Supabase 未初始化');

    return client
      .from('spots')
      .insert({
        name: data.name || '',
        latitude: parseFloat(data.latitude) || 0,
        longitude: parseFloat(data.longitude) || 0,
        address: data.address || '',
        description: data.description || '',
        contact: data.contact || '',
        tags: data.tags || [],
        images: data.images || [],
        status: 'pending',
        year: new Date().getFullYear()
      })
      .select()
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return _formatSpot(result.data);
      });
  }

  /**
   * 上传图片到 Supabase Storage
   * @param {File} file
   * @returns {Promise<string>} 图片公开 URL
   */
  function uploadImage(file) {
    if (!initialized) throw new Error('Supabase 未初始化');

    var timestamp = Date.now();
    var random = Math.random().toString(36).substring(2, 8);
    var fileExt = file.name.split('.').pop() || 'jpg';
    var filePath = 'public/' + timestamp + '_' + random + '.' + fileExt;

    return client.storage
      .from('spot-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })
      .then(function (result) {
        if (result.error) throw result.error;

        // 获取公开 URL
        var urlResult = client.storage
          .from('spot-images')
          .getPublicUrl(filePath);

        return urlResult.data.publicUrl;
      });
  }

  /**
   * 批量上传图片
   */
  function uploadImages(files) {
    var uploads = [];
    for (var i = 0; i < Math.min(files.length, 3); i++) {
      uploads.push(uploadImage(files[i]));
    }
    return Promise.all(uploads);
  }

  /**
   * 格式化 Supabase 返回的数据
   */
  function _formatSpot(row) {
    return {
      objectId: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      description: row.description,
      contact: row.contact,
      images: row.images || [],
      tags: row.tags || [],
      status: row.status,
      year: row.year,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ========== 公开 API ==========
  return {
    init: init,
    fetchApprovedSpots: fetchApprovedSpots,
    submitSpot: submitSpot,
    uploadImage: uploadImage,
    uploadImages: uploadImages,
    getConfig: function () { return CONFIG; }
  };
})();
