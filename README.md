# 钓龙虾地图

查看附近的钓龙虾地点，支持按距离排序、地图展示、用户提交新钓点。

---

## 第一步：申请 API 凭证

### 1. 高德地图 API Key（必须）

你已提供：
- **Key**：`911869ff33a0af0b03b562e05085729b`（已配置到代码中）
- **安全密钥**：`7519f5624e16bef6193f0282f9d2adbc`（已配置到代码中）



### 2. Supabase 账号（必须 — 替代已停止注册的 LeanCloud）

1. 打开 [Supabase](https://supabase.com/)，点击「Start your project」注册（支持 GitHub 登录）
2. 创建一个新项目：
   - **Name**：`crayfish-map`
   - **Database Password**：设置一个密码并**记下来**
   - **Region**：选择 **Northeast Asia (Seoul)** 或 **Southeast Asia (Singapore)**（离中国最近）
3. 创建后等待数据库初始化完成（约 2 分钟）
4. 进入项目 → 左侧「Settings」→「API」：
   - 记下 **Project URL**（如 `https://xxxxxxxxxxxx.supabase.co`）
   - 记下 **anon public key**（长的字符串）

### 3. 创建 spots 表

进入项目 → 左侧「SQL Editor」→ 点击「New query」→ 粘贴以下 SQL → 点击「Run」：

```sql
-- 创建钓点表
CREATE TABLE spots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT DEFAULT '',
  description TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  images JSONB DEFAULT '[]'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending',
  year INTEGER DEFAULT EXTRACT(YEAR FROM NOW()),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 开启 RLS（行级安全）
ALTER TABLE spots ENABLE ROW LEVEL SECURITY;

-- 允许任何人读取已审核的钓点（公开读）
CREATE POLICY "允许公开读取" ON spots
  FOR SELECT USING (true);

-- 允许任何人提交新钓点（公开写）
CREATE POLICY "允许公开提交" ON spots
  FOR INSERT WITH CHECK (true);
```

### 4. 创建图片存储桶

1. 左侧「Storage」→ 点击「New bucket」
2. Name：`spot-images`
3. **勾选「Public bucket」**（允许公开访问图片）
4. 点击「Create bucket」
5. 进入 bucket → 「Policies」→ 创建两条策略：
   - **允许上传**：`INSERT` → policy name: `允许上传` → `true`
   - **允许读取**：`SELECT` → policy name: `允许读取` → `true`

---

## 第二步：配置凭证

打开 `index.html`，找到底部配置代码（约第 82 行），把 Supabase 的 `YOUR_xxx` 替换：

```javascript
App.boot({
  supabase: {
    supabaseUrl: 'https://xxxxxxxxxxxx.supabase.co',  // 你的 Project URL
    supabaseAnonKey: 'eyJhbGciOi...'                   // 你的 anon public key
  },
  amap: {
    amapKey: '911869ff33a0af0b03b562e05085729b',       // 已配好
    amapSecurityJsCode: '7519f5624e16bef6193f0282f9d2adbc'  // 已配好
  }
});
```

---

## 第三步：添加测试数据

Supabase 控制台 → 左侧「Table Editor」→ 选择 `spots` 表 → 点击「Insert row」：

| 字段 | 值 |
|------|-----|
| name | 测试钓点-XX村虾塘 |
| latitude | 23.1291（换成你附近的纬度） |
| longitude | 113.2644（换成你附近的经度） |
| address | 广东省广州市XX区XX村 |
| description | 免费野塘，虾很多 |
| tags | ["野塘", "虾多"] |
| status | **approved** |
| year | 2026 |

> **重要**：status 必须是 `approved`，否则不会在地图上显示。

---

## 第四步：本地预览

1. 打开终端/命令行，进入项目目录 `d:/workpace/clawmap/crayfish-map/`
2. 运行：`python -m http.server 8000`
3. 浏览器打开：`http://localhost:8000`

> 不要直接双击 index.html，高德地图需要 HTTP 协议才能正常定位。

---

## 第五步：部署上线（免费）

### 通过 GitHub Pages 部署

1. 注册 [GitHub](https://github.com/) 账号
2. 创建一个新仓库（如 `crayfish-map`）
3. 把整个项目上传到仓库
4. Settings → Pages → Source 选 `main` → Save
5. 访问地址：`https://你的用户名.github.io/crayfish-map/`

### 绑定域名（可选，约 60 元/年）

1. [阿里云万网](https://wanwang.aliyun.com/) 购买域名
2. DNS 添加 CNAME 记录指向 `你的用户名.github.io`

---

## 审核钓点

用户提交的钓点 status 为 `pending`，不会显示在地图上：

1. 登录 Supabase → Table Editor → `spots` 表
2. 筛选 status = `pending` 的行
3. 手动将 status 改为 `approved` 或 `rejected`
4. 审核通过后刷新网页即可看到

---

## 年度数据归档

每年龙虾季结束后（如 10 月）：

1. Supabase → SQL Editor → 导出数据备份
2. 批量更新：将 `approved` 且 year=当前年份 的 status 改为 `outdated`
3. 新钓季提交的数据自动标记为新年份

---

## 常见问题

**Q: 打开网页是白屏？**
A: 按 F12 打开浏览器控制台，看报错信息。最常见：Supabase 凭证没配、SQL 没执行（没有 spots 表）。

**Q: 定位失败/不准？**
A: 手机浏览器需授权定位权限；电脑浏览器定位精度较低。

**Q: 提交钓点后看不到？**
A: 新提交的钓点 status 是 `pending`，需在 Supabase 后台手动改为 `approved`。

**Q: Supabase 国内访问慢？**
A: 创建项目时 Region 选 Seoul 或 Singapore 相对较快。免费层足够支撑 3000 条数据。
