// 微信隐私授权合规流程
// ----------------------------------------------------------------------------
// 项目已开启 __usePrivacyCheck__: true（见 project.config.json），意味着微信会
// 强制校验隐私合规。标准做法：
//   1. 注册 wx.onNeedPrivacyAuthorize，拦截任何隐私接口调用，先弹窗取得同意；
//   2. 启动后通过 wx.getPrivacySetting 判断平台是否要求授权，若要求且用户未同意，
//      主动 wx.requirePrivacyAuthorize 触发上述弹窗。
//
// 当前客户端并未直接调用 wx.login / getUserProfile（openid 由云函数服务端
// getWXContext 获取），因此缺弹窗不会运行时崩溃；但实现标准授权流程可确保
// 合规、向前兼容（未来一旦接入 wx.login 也不会被拦截）。
// ----------------------------------------------------------------------------

import Taro from '@tarojs/taro';

const PRIVACY_AGREED_KEY = '__ZUITIYA_PRIVACY_AGREED__';

function wxObj(): any {
  return (globalThis as any).wx || (Taro as any);
}

function hasAgreed(): boolean {
  try {
    return Taro.getStorageSync(PRIVACY_AGREED_KEY) === true;
  } catch {
    return false;
  }
}

function markAgreed(): void {
  try {
    Taro.setStorageSync(PRIVACY_AGREED_KEY, true);
  } catch {
    /* 忽略存储异常 */
  }
}

// 展示隐私授权弹窗。用户同意 -> resolve('agree')，否则 resolve('disagree')。
function showPrivacyModal(): Promise<'agree' | 'disagree'> {
  return new Promise((resolve) => {
    const openDetail = () => {
      // 优先用微信官方隐私协议页（需 MP 后台已配置指引）；失败则跳转应用内隐私页。
      wxObj().openPrivacyContract?.({
        success: () => reAsk(),
        fail: () => {
          Taro.navigateTo({ url: '/pages/privacy/index' })
            .then(() => reAsk())
            .catch(() => resolve('disagree'));
        },
      });
    };
    const reAsk = () => {
      Taro.showModal({
        title: '隐私保护指引',
        content: '请阅读《嘴替鸭隐私保护指引》，阅读后点击「同意并继续」即表示你已理解并同意我们的隐私承诺。',
        confirmText: '同意并继续',
        cancelText: '暂不使用',
        success: (r) => {
          if (r.confirm) {
            markAgreed();
            resolve('agree');
          } else {
            resolve('disagree');
          }
        },
        fail: () => resolve('disagree'),
      });
    };

    Taro.showModal({
      title: '隐私保护指引',
      content:
        '使用前请阅读并同意《嘴替鸭隐私保护指引》。我们仅收集必要信息（微信身份标识、你主动填写的档案与本次输入的社交原话），绝不收集手机号、位置等敏感信息，也不会保存你的对话记录。',
      confirmText: '同意并继续',
      cancelText: '查看指引',
      success: (res) => {
        if (res.confirm) {
          markAgreed();
          resolve('agree');
        } else {
          openDetail();
        }
      },
      fail: () => resolve('disagree'),
    });
  });
}

// 在 app 启动时调用一次，完成授权流程注册与主动请求。
export function initPrivacyAuthorization(): void {
  if (process.env.TARO_ENV !== 'weapp') return;
  const wx = wxObj();
  if (!wx) return;

  // 1) 注册隐私接口拦截：任何隐私接口被调用且未授权时触发弹窗
  wx.onNeedPrivacyAuthorize?.((resolve: (opts: { event: string }) => void) => {
    showPrivacyModal().then((r) => {
      resolve({ event: r === 'agree' ? 'agree' : 'disagree' });
    });
  });

  // 2) 主动请求一次授权（仅当平台要求且用户尚未同意）
  wx.getPrivacySetting?.({
    success: (res: any) => {
      if (res && res.needAuthorization && !hasAgreed()) {
        wx.requirePrivacyAuthorize?.({
          success: () => markAgreed(),
          fail: () => {
            /* 用户拒绝：保持未授权状态，后续隐私接口调用会再次触发弹窗 */
          },
        });
      }
    },
    fail: () => {
      /* 获取隐私设置失败不阻塞启动 */
    },
  });
}
