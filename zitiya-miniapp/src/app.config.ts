export default defineAppConfig({
  pages: ['pages/defend/index', 'pages/attack/index', 'pages/quotes/index', 'pages/settings/index', 'pages/profile/index', 'pages/privacy/index', 'pages/admin/index'],
  // 组件按需注入（代码质量扫描要求）
  lazyCodeLoading: 'requiredComponents',
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FFF9EF',
    navigationBarTitleText: '嘴替鸭',
    navigationBarTextStyle: 'black'
  },
  // 微信同声传译插件（语音转文字）
  // 注意：测试号（touristappid）不支持插件，声明会报 41002 appid missing。
  // 拿到真实 AppID 后，取消下面注释，并在 mp 后台添加该插件：
  // plugins: {
  //   WechatSI: {
  //     version: '0.3.5',
  //     provider: 'wx069ba97219f66d99'
  //   }
  // },
  // 录音权限声明（微信合法 scope 为 scope.record，用于语音输入转文字）
  permission: {
    'scope.record': {
      desc: '用于语音输入，将你说的话转成文字'
    }
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#D98706',
    backgroundColor: '#FFFFFF',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/defend/index',
        text: '拆招',
        iconPath: 'assets/tabbar/defend.png',
        selectedIconPath: 'assets/tabbar/defend-selected.png'
      },
      {
        pagePath: 'pages/attack/index',
        text: '出招',
        iconPath: 'assets/tabbar/attack.png',
        selectedIconPath: 'assets/tabbar/attack-selected.png'
      },
      {
        pagePath: 'pages/quotes/index',
        text: '语录',
        iconPath: 'assets/tabbar/quotes.png',
        selectedIconPath: 'assets/tabbar/quotes-selected.png'
      },
      {
        pagePath: 'pages/settings/index',
        text: '设置',
        iconPath: 'assets/tabbar/settings.png',
        selectedIconPath: 'assets/tabbar/settings-selected.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tabbar/profile.png',
        selectedIconPath: 'assets/tabbar/profile-selected.png'
      }
    ]
  }
})
