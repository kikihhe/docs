---
title: 1. 学习md文档的使用 # title 只限制网站url，不限制左侧导航栏，左侧导航栏需要在 config.mts 中配置
outline: deep # 
sidebar: false # 加上这个之后，本md不在左侧展示
navbar: false # 加上这个，本md不在上面展示
lastUpdated: true # 加上这个，本md展示最后一次更新时间
---

# Runtime API Examples


```md
<script setup>
import { useData } from 'vitepress'

const { theme, page, frontmatter } = useData()
</script>

## Results

### Theme Data
<pre>{{ theme }}</pre>

### Page Data
<pre>{{ page }}</pre>

### Page Frontmatter
<pre>{{ frontmatter }}</pre>
```

<script setup>
import { useData } from 'vitepress'

const { site, theme, page, frontmatter } = useData()
</script>

## Results

### Theme Data
<pre>{{ theme }}</pre>

### Page Data
<pre>{{ page }}</pre>

### Page Frontmatter
<pre>{{ frontmatter }}</pre>

## More

Check out the documentation for the [full list of runtime APIs](https://vitepress.dev/reference/runtime-api#usedata).
