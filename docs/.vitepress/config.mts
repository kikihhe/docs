import { defineConfig } from 'vitepress'


export default defineConfig({
  title: "kikihhe-docs",
  description: "It's kikihhe's blog",
  // 代码块显示行号
  markdown: {
    lineNumbers: true
  },
  themeConfig: {
    outline: [2, 6], // 整个站点的md显式 2-6 级标题，可以被md内部的outline覆盖
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Java', link: '/java/1. 入门' },
      { text: 'Go', link: '/go/1. Go 变量、常量、数据类型' } // 导航栏点击后直接进入第一个文章，不必再使用 index
    ],
    // 支持站内搜索
    search: {
      provider: 'local'
    },
    // 当md中出现外部链接时，显示其图标
    externalLinkIcon: true,

    sidebar: {
      '/java/':[
        {
          text: '', // 侧边栏的目录的 text 不展示更好看
          items: [
            // { text: '简介', link: '/java/', collapsed: true},
            {
              text: 'java基础',
              link: '/java/10. Java基础/',
              collapsed: true, // 有一个箭头，用户点击后折叠该sidebar
              items: [
                {text: 'Java NIO', link: '/java/10. Java基础/100.Java NIO'},
                {text: 'Reactor模式', link: '/java/10. Java基础/150.Reactor模式'},
                {text: '单机定时任务的实现', link: '/java/10. Java基础/300.单机定时任务的实现'},
              ],
            },
            {
              text: 'java并发',
              link: '/java/75. Java并发/',
              collapsed: true, // 有一个箭头，用户点击后折叠该sidebar
              items: [
                {text: 'CAS', link: '/java/75. Java并发/50.CAS'},
                {text: 'AQS源码解析', link: '/java/75. Java并发/60.AQS源码解析'},
                {text: 'ReentrantLock', link: '/java/75. Java并发/65.ReentrantLock'},
                {text: 'ReentrantReadWriteLock', link: '/java/75. Java并发/70.ReentrantReadWriteLock'},
                // {text: '原子类', link: '/java/75. Java并发/100.原子类'},
                {text: 'FutureTask中的适配器模式', link: '/java/75. Java并发/250.FutureTask中的适配器模式'},
                {text: '线程池', link: '/java/75. Java并发/300.线程池'},
                {text: '线程池源码解析', link: '/java/75. Java并发/400.线程池源码解析'},
              ],
            },
            { text: '1. 入门', link: '/java/1. 入门' },
            { text: '2. 熟悉', link: '/java/2. 熟悉' },
            { text: '3. 精通', link: '/java/3. 精通' },
          ]
        }
      ],
      '/go/':[
        {
          text: '',
          items: [
            // { text: 'index', link: '/go/'},
            { text: '1. Go 变量、常量、数据类型', link: '/go/1. Go 变量、常量、数据类型' },
            { text: '2. 熟悉', link: '/go/2. 熟悉' },
            { text: '3. 精通', link: '/go/3. 精通' },
            { text: 'channel', link: '/go/channel' },
            { text: 'context', link: '/go/context' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/kikihhe' }
    ]
  }
})
