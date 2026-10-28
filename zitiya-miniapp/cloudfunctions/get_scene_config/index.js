// 云函数：get_scene_config
// 用途：返回 scene_config.doc('main') 的完整内容
// 被小程序 wx.cloud.callFunction 和 H5 HTTP fetch 共用
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const res = await db.collection('scene_config').doc('main').get();
    return {
      code: 0,
      message: 'ok',
      data: res.data || null
    };
  } catch (err) {
    // doc 不存在也正常返回 null，不让前端崩
    if (err && err.errCode === -1) {
      return {
        code: 0,
        message: 'no_config',
        data: null
      };
    }
    console.log(JSON.stringify({ ts: Date.now(), level: 'error', fn: 'get_scene_config', msg: '[get_scene_config] 错误: ' + (err && err.message ? err.message : String(err)) }));
    return {
      code: 1,
      message: err?.message || String(err),
      data: null
    };
  }
};
