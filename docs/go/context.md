## 1. 概述

Context 用于 goroutine 之间数据传递以及通信。当一个协程开启时，我们无法强制关闭它，常见的关闭协程的原因 ：goroutine 自己跑完结束、主协程结束子协程被迫结束、子协程负责的任务不再被需要进而被强制关闭。

如 ：子协程在收集服务器状态，用户不想再收集了，于是手动终止收集任务，使用 channel 实现如下 ：

```Go
func main() {
    stop := make(chan bool)
    
    // 开启收集任务
    go collect(stop)
    
    time.Sleep(10 * time.Second)
    
    // 模拟用户终止收集任务
    stop <- true
    
    // 给协程打印时间，要不然直接结束了，子协程打印不出来完整信息
    time.Sleep(1 * time.Second)
}


func collect(stop <-chan bool) {
    for {
       select {
       case <-stop:
          fmt.Println("收集任务结束")
          return
       default:
          fmt.Println("收集服务器资源中....")
          time.Sleep(2 * time.Second)
       }
    }
}
```

> channel + select 可以实现结束一个 goroutine 的功能，不过这种方式也有局限性，如果有很多 goroutine 都需要控制结束怎么办，如果这些 goroutine  又衍生出其他更多的 goroutine 怎么办呢，这时候可以使用 Context

Context 是一个接口 ：

```Go
type Context interface {
    Deadline() (deadline time.Time, ok bool)
    Done()  <-chan struct{}
    
    Err() error
    Value(key interface{}) interface{}
}
```

- Deadline ：返回的第一个值是截止时间，到了这个时间点 Context 会自动触发 Cancel 动作。返回值第二个为 bool，代表此 Context 是否指定了截止时间。
- Done ：被 Cancel 时返回一个只读的通道，类型为 struct{}，当这个通道可读时，意味着 parent context 已经发起了取消请求，根据这个信号，开发者就可以做一些清理动作，退出当前 goroutine
- Err ：返回 Context 被 cancel 的原因
- Value ：返回被绑定到 Context 的值，是一个键值对，一般为线程安全的。

## 2. Context 的使用

那么 Context 如何获得取消、定时取消、存值功能呢？肯定是实现接口，不过这里先说一下如何使用 ：

```Go
func BackGround() Context
func TODO() Context

func WithCancel(parent Context) (ctx Context, cancel CancelFunc)
func WithDeadline(parent Context, deadline time.Time) (Context, CancelFunc)
func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc)
func WithValue(parent Context, key, val interface{}) Context
```

这四个函数有一个共同的特点，就是第一个参数，都是接收一个 父 context。一般来说第一个 context 都会使用 context.BackGround() 获取一个空 context

通过一次继承，就多实现了一个功能，比如使用 WithTimeout 函数获取一个定时取消的 c1，使用 c1 作为 parent 获得的 c2 既拥有定时取消功能，又拥有存数据功能。

```Go
parent := context.BackGround()
c1 := context.WithTimeout(parent, time.Second * 10) // c1拥有定时取消功能
c2 := context.WithValue(c1, name, "xiaoming") // c2拥有定时取消功能 && 存数据功能
```

- WithDeadline ：

    ```go
    func monitor(ctx context.Context, number int) {
        for {
           select {
           case <-ctx.Done():
              fmt.Printf("监控器%v，监控结束。\n", number)
              return
           default:
              fmt.Printf("监控器%v，正在监控中...\n", number)
              time.Sleep(2 * time.Second)
           }
        }
    }
    
    func main() {
        ctx01, cancel := context.WithCancel(context.Background())
        ctx02, cancel := context.WithDeadline(ctx01, time.Now().Add(1*time.Second))
    
        defer cancel()
    
        for i := 1; i <= 5; i++ {
           go monitor(ctx02, i)
        }
    
        time.Sleep(5 * time.Second)
        if ctx02.Err() != nil {
           fmt.Println("监控器取消的原因: ", ctx02.Err())
        }
    
        fmt.Println("主程序退出！！")
    }
    ```

  输出 ：

    ```go
    监控器5，正在监控中...
    监控器1，正在监控中...
    监控器2，正在监控中...
    监控器3，正在监控中...
    监控器4，正在监控中...
    监控器3，监控结束。
    监控器4，监控结束。
    监控器2，监控结束。
    监控器1，监控结束。
    监控器5，监控结束。
    监控器取消的原因:  context deadline exceeded
    主程序退出！！
    ```



- WithTimeout ：

    ```go
    package main
    
    import (
        "context"
        "fmt"
        "time"
    )
    
    func monitor(ctx context.Context, number int)  {
        for {
           select {
           case <- ctx.Done():
              fmt.Printf("监控器%v，监控结束。\n", number)
              return
           default:
              fmt.Printf("监控器%v，正在监控中...\n", number)
              time.Sleep(2 * time.Second)
           }
        }
    }
    
    func main() {
        ctx01, cancel := context.WithCancel(context.Background())
    
        ctx02, cancel := context.WithTimeout(ctx01, 1 * time.Second)
    
        defer cancel()
    
        for i :=1 ; i <= 5; i++ {
           go monitor(ctx02, i)
        }
    
        time.Sleep(5  * time.Second)
        if ctx02.Err() != nil {
           fmt.Println("监控器取消的原因: ", ctx02.Err())
        }
    
        fmt.Println("主程序退出！！")
    }
    ```

  输出 ：

    ```go
    监控器1，正在监控中...
    监控器5，正在监控中...
    监控器3，正在监控中...
    监控器2，正在监控中...
    监控器4，正在监控中...
    监控器4，监控结束。
    监控器2，监控结束。
    监控器5，监控结束。
    监控器1，监控结束。
    监控器3，监控结束。
    监控器取消的原因:  context deadline exceeded
    主程序退出！！
    ```



- WithValue ：

    ```go
    package main
    
    import (
        "context"
        "fmt"
        "time"
    )
    
    func monitor(ctx context.Context, number int)  {
        for {
           select {
           case <- ctx.Done():
              fmt.Printf("监控器%v，监控结束。\n", number)
              return
           default:
              // 获取 item 的值
              value := ctx.Value("item")
              fmt.Printf("监控器%v，正在监控 %v \n", number, value)
              time.Sleep(2 * time.Second)
           }
        }
    }
    
    func main() {
        ctx01, cancel := context.WithCancel(context.Background())
        ctx02, cancel := context.WithTimeout(ctx01, 1* time.Second)
        ctx03 := context.WithValue(ctx02, "item", "CPU")
    
        defer cancel()
    
        for i :=1 ; i <= 5; i++ {
           go monitor(ctx03, i)
        }
    
        time.Sleep(5  * time.Second)
        if ctx02.Err() != nil {
           fmt.Println("监控器取消的原因: ", ctx02.Err())
        }
    
        fmt.Println("主程序退出！！")
    }
    ```

  输出 ：

    ```go
    监控器4，正在监控 CPU
    监控器5，正在监控 CPU
    监控器1，正在监控 CPU
    监控器3，正在监控 CPU
    监控器2，正在监控 CPU
    监控器2，监控结束。
    监控器5，监控结束。
    监控器3，监控结束。
    监控器1，监控结束。
    监控器4，监控结束。
    监控器取消的原因:  context deadline exceeded
    主程序退出！！
    ```



## 3. 源码

上面那些函数 WithXxx 是 exported 函数，提供给用户调用的创建对应 Context 。

![img](https://aakxsi3kwv.feishu.cn/space/api/box/stream/download/asynccode/?code=OTM1YmJmZjJiN2EzYzcyNjk3YjEzMmY0NmE1MDAxM2NfeTV3YlhrUFBEUnp2Rk9sck10STFzdEVJc2pBeXRhOGNfVG9rZW46VWlZQWIwQXVMb0dmZ1d4ZEI1bmNSSGVsbk9lXzE3MzUxMzE4NzA6MTczNTEzNTQ3MF9WNA)

### 3.1 Context

Context 是一个接口 ：

```Go
type Context interface {
    Deadline() (deadline time.Time, ok bool)
    Done()  <-chan struct{}
    
    Err() error
    Value(key interface{}) interface{}
}
```

- Deadline ：返回的第一个值是截止时间，到了这个时间点 Context 会自动触发 Cancel 动作。返回值第二个为 bool，代表此 Context 是否指定了截止时间。
- Done ：被 Cancel 时返回一个只读的通道，类型为 struct{}，当这个通道可读时，意味着 parent context 已经发起了取消请求，根据这个信号，开发者就可以做一些清理动作，退出当前 goroutine。Done 就是获取这个通道
- Err ：返回 Context 被 cancel 的原因。如果 Context 还未被取消，返回 nil；如果调用 Cancel 主动取消则返回 `Canceled` 错误；如果是截止时间到了自动取消，则返回 `DeadlineExceeded`。
- Value ：返回被绑定到 Context 的值，是一个键值对，一般为线程安全的。

其中 `Canceled` 和 `DeadlineExceeded` 的定义如下 ：

```Go
// Canceled is the error returned by [Context.Err] when the context is canceled.
var Canceled = errors.New("context canceled")

// DeadlineExceeded is the error returned by [Context.Err] when the context's deadline passes.
var DeadlineExceeded error = deadlineExceededError{}

type deadlineExceededError struct{}
func (deadlineExceededError) Error() string   { return "context deadline exceeded" }
func (deadlineExceededError) Timeout() bool   { return true }
func (deadlineExceededError) Temporary() bool { return true }
```

### 3.2 emptyCtx

emptyContext 是空 Context，定义如下 ：

```Go
type emptyCtx struct{}
```

空的 Context 没有 取消、定时取消、存值 的功能。因为 emptyContext 实现 Context 接口如下 ：

```Go
func (emptyCtx) Deadline() (deadline time.Time, ok bool) {
    return
}

func (emptyCtx) Done() <-chan struct{} {
    return nil
}

func (emptyCtx) Err() error {
    return nil
}

func (emptyCtx) Value(key any) any {
    return nil
}
```

所以 emptyContext 大多作为 父 Context 使用，go 提供了两种 emptyContext ：

```Go
type backgroundCtx struct{ emptyCtx }

func (backgroundCtx) String() string {
    return "context.Background"
}

type todoCtx struct{ emptyCtx }

func (todoCtx) String() string {
    return "context.TODO"
}
```

我们平时使用的 context.BackGround() 得到的就是 backgroundCtx ：

```Go
func Background() Context {
    return backgroundCtx{}
}
```

todoCtx 一般用于你暂时不知道这里应该使用什么样的 Context 时，先用 todoCtx 顶着。

### 3.3 cancelCtx

cancelCtx 是具有取消功能的 Context，通过 WithCancel 最终获取的就是 cancelCtx，定义如下 ：

```Go
type cancelCtx struct {
    // 拥有 Context 所有方法
    Context

    // 保证线程安全 
    mu       sync.Mutex            // protects following fields
    
    // chan struct{} 类型，会在取消时调用 cancel() 函数进行关闭，表示 Context 已取消
    done     atomic.Value          // of chan struct{}, created lazily, closed by first cancel call
    
    // 当前 ctx 的所有 子ctx, 父ctx取消时就可以调用子ctx的取消方法
    children map[canceler]struct{} // set to nil by the first cancel call
    
    err      error                 // set to non-nil by the first cancel call
    
    cause    error                 // set to non-nil by the first cancel call
}
```

`err` 和 `cause` 分别记录了 context 被取消的原因和根因，`err` 是 context 包内部产生的，`cause` 则是我们在使用 `WithXxxCause()` 方法构造 context 对象时传入的。

cancelCtx 的 子ctx 并不是 ctx，而是 `canceler` 类型 ：

```Go
// A canceler is a context type that can be canceled directly. 
// The implementations are *cancelCtx and *timerCtx.
type canceler interface {
    cancel(removeFromParent bool, err, cause error)
    Done() <-chan struct{}
}
```

它是一个接口，代表了所有可以被取消的 ctx，所以虽然没有明写 map[Context]struct{} ，其实最后 key 还是 context。

也就是说，在 context 包中涉及的支持取消的 Context 都需要继承并实现 canceler 的两个方法。

父 context 取消时会调用所有子 ctx 的 calcen() 方法进行递归取消，并且有取消功能的 context 必须实现 Done 方法，这样使用者才能通过监听 done channel 知道这个 context 是否已经取消。

1. func (c *cancelCtx) Done() <-chan struct{} ，获取通道

   使用 double check，首先判断 d.done 是否为空，不为空说明已经创建，直接返回即可。为空说明需要去创建。

    ```go
    func (c *cancelCtx) Done() <-chan struct{} {
        d := c.done.Load()
        if d != nil {
           return d.(chan struct{})
        }
        c.mu.Lock()
        defer c.mu.Unlock()
        d = c.done.Load()
        if d == nil {
           d = make(chan struct{})
           c.done.Store(d)
        }
        return d.(chan struct{})
    }
    ```

- func (c *cancelCtx) cancel(removeFromParent bool, err, cause error)

    ```go
    // removeFromParent: 是否要从父ctx的children中将此ctx移除
    // err: 取消的错误原因
    // cause: 取消的根本原因
    func (c *cancelCtx) cancel(removeFromParent bool, err, cause error) {
        // 执行 cancel 时，err不能为空
        if err == nil {
           panic("context: internal error: missing cancel error")
        }
        if cause == nil {
           cause = err
        }
        c.mu.Lock()
        
        // 如果已经非空，说明已经被取消了，可以直接返回
        if c.err != nil {
           c.mu.Unlock()
           return // already canceled
        }
        c.err = err
        c.cause = cause
        d, _ := c.done.Load().(chan struct{})
        
        // 如果 channel 为空，直接返回一个已经关闭的 channel
        // 不为空，就将已有的 channel 关闭
        if d == nil {
           c.done.Store(closedchan)
        } else {
           close(d)
        }
        
        // 遍历子节点，执行关闭操作
        for child := range c.children {
           // NOTE: acquiring the child's lock while holding parent's lock.
           child.cancel(false, err, cause)
        }
        c.children = nil
        c.mu.Unlock()
        
        // 是否需要将此 ctx从 父ctx 的 children 中移除
        if removeFromParent {
           removeChild(c.Context, c)
        }
    }
    ```

  流程 ：

    - 如果 ctx.err 非空，说明已经取消了，直接返回
    - 将 chan 关闭
    - 关闭孩子、判断是否要从父节点那里把自己移除
    -  为什么把 chan 关闭就能做到 “ cancel ”呢？因为一旦把它关闭，其他的 读goroutine 就会从阻塞状态走出并读到一个零值，此时就说明此 ctx 已经取消。

