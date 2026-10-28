// 云函数 report_event —— 接收前端行为埋点 / 远程日志，写入云数据库 app_logs 集合
// 隐私底线：服务端对 props 二次白名单过滤，任何非白名单字段（尤其用户输入/回话/key/token）一律丢弃。
// 集合权限建议设为「仅创建者可读写」，避免泄露其它用户数据。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// props 白名单（与前端 src/utils/logger.ts 的 ALLOWED_PROPS 保持一致）
const ALLOWED_PROPS = [
  'page', 'source', 'intentKey', 'intentLayer', 'ok', 'costMs',
  'errCode', 'engineType', 'count', 'from'
];

exports.main = async (event) => {
  const { event: name, props = {}, ts = Date.now(), level = 'info' } = event || {};
  if (!name || typeof name !== 'string') {
    return { code: 400, message: 'missing event name' };
  }

  // 服务端二次过滤：只保留白名单字段，杜绝敏感数据入库
  const clean = {};
  for (const k of Object.keys(props || {})) {
    if (ALLOWED_PROPS.indexOf(k) !== -1) clean[k] = props[k];
  }

  try {
    await db.collection('app_logs').add({
      data: {
        event: name,
        props: clean,
        level,
        ts,
        env: process.env.TCB_ENV || '',
        createTime: Date.now(),
      }
    });
    return { code: 0, message: 'ok' };
  } catch (e) {
    // 日志写入失败绝不影响主业务
    return { code: 1, message: e.message || 'write failed' };
  }
};
