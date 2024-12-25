## 1. 概述

Go 语言的并发模式 ：不要通过共享内存来通信，而应该通过通信来共享内存。

Go 语言的通道 ：一种通信机制，用于在不同的 goroutine 之间传递数据，所以它是线程安全的。

## 2. 使用

channel 是引用类型，声明后必须初始化后才能使用

channel 内的值是具有类型的，一个 string 的 channel 只能存放 string 数据

```Go
package main

import (
        "fmt"
        "time"
)

func main() {
        ch1 := make(chan string)
        ch2 := make(chan string)

        go func() {
                time.Sleep(1 * time.Second)
                ch1 <- "message from ch1"
        }()

        go func() {
                time.Sleep(2 * time.Second)
                ch2 <- "message from ch2"
        }()

        for i := 0; i < 2; i++ {
                select {
                case msg1 := <-ch1:
                        fmt.Println("Received:", msg1)
                case msg2 := <-ch2:
                        fmt.Println("Received:", msg2)
                }
        }
}

输出：
ch1 在 1 秒后发送消息， ch2 会在 2 秒后发送消息，select 会首先处理 ch1 的消息，然后处理 ch2 的消息。
Received: message from ch1
Received: message from ch2
```

注意事项 ：

- channel == nil ：
    - 读 ：阻塞
    - 写 ：阻塞
    - close ：panic
- channel 无数据 ：
    - 读 ：阻塞
    - 写 ：若有缓冲区则写入，无缓冲区则阻塞
- channel 已关闭
    - 读 ：零值
    - 写 ：panic

> 尽量不要在单 goroutine 中使用 channel ，容易死锁。

## 3. 源码

channel 由三个非常重要的部分组成 ：

- 环形缓冲区（队列）：用于存放元素
- 读协程的阻塞队列 ：当 channel 中没有元素时，read 的协程会进入该队列等候
- 写协程的阻塞队列 ：当 channel 元素已满时，write 的协程会进入该队列等候

### 3.1 hchan

hchan 结构体如下 ：

```Go
type hchan struct {
    qcount uint           // 环形队列中的数据个数
    
    dataqsize uint        // 环形队列大小
    
    buf unsafe.Pointer    // 指向环形队列的指针
    
    elemsize uint16       // channel存储的类型占据字节大小
    
    closed uint32         // channel 状态，1-关闭，0-未关闭
    
    elemtype *_type       // 数据类型
    
    sendx uint            // 发送索引
    recvx uint            // 接收索引
    
    recvq waitq           // 读协程等待队列
    sendq waitq           // 写协程等待队列
    
    lock mutex            // 锁，保证线程安全
}
```

### 3.2 waitq

waitq 结构体用来存储阻塞在 chan 上的协程，协程会被包装为 sudog 放入此队列。

```Go
type waitq struct {
    first *sudog    // 头
    last *sudog     // 尾
}
```

### 3.3 makechan

使用 make 创建 channel 时会执行 makechan 函数

```Go
// t: channel中存储的元素类型
// size: 初始化大小
func makechan(t *chantype, size int) *hchan {

        elem := t.Elem
        // 忽略一些判断
        
        // 计算内存
        mem, overflow := math.MulUintptr(elem.Size_, uintptr(size))
        if overflow || mem > maxAlloc-hchanSize || size < 0 {
                panic(plainError("makechan: size out of range"))
        }

       
        var c *hchan
        switch {
        case mem == 0:
                // 如果chan是空的 则需要申请hchanSize空间 以满足 内存对齐要求
                c = (*hchan)(mallocgc(hchanSize, nil, true))
                // Race detector uses this location for synchronization.
                c.buf = c.raceaddr()
        case elem.PtrBytes == 0:
                // Elements do not contain pointers.
                // Allocate hchan and buf in one call.
                c = (*hchan)(mallocgc(hchanSize+mem, nil, true))
                c.buf = add(unsafe.Pointer(c), hchanSize)
        default:
                // 分配内存
                // Elements contain pointers.
                c = new(hchan)
                c.buf = mallocgc(mem, elem, true)
        }
        // 初始化hchan
        c.elemsize = uint16(elem.Size_)
        c.elemtype = elem
        c.dataqsiz = uint(size)
        lockInit(&c.lock, lockRankHchan)

        if debugChan {
                print("makechan: chan=", c, "; elemsize=", elem.Size_, "; dataqsiz=", size, "\n")
        }
        return c
}
```

### 3.4 chansend

有 goroutine 向 channel 中写数据时，调用 chansend1 方法，不过这个方法是 exported 的，最终调用的是 chansend 方法

```Go
// c : channel
// elem : 数据
func chansend1(c *hchan, elem unsafe.Pointer) {
        chansend(c, elem, true, getcallerpc())
}
```

调用时多一个 block 和 callerpc 参数 ：

- block ：是否阻塞，正常使用 channel 时 block 为 true，也就是当缓冲区满时阻塞等待。

  channel 与 select(default) 配合时 block 为 false，当缓冲区满时不等待直接返回插入 send 结果

- callerpc ：

```Go
// ep: 数据
func chansend(c *hchan, ep unsafe.Pointer, block bool, callerpc uintptr) bool {
    // 如果 channel 为 nil 
    if c == nil {
       // 如果正常调用，该值为 true，阻塞调用者goroutine
       // 如果与 select 搭配，该值为 false，直接返回 
       if !block {
          return false
       }
       gopark(nil, nil, waitReasonChanSendNilChan, traceBlockForever, 2)
       throw("unreachable")
    }
    
    if debugChan {
       print("chansend: chan=", c, "\n")
    }

    if raceenabled {
       racereadpc(c.raceaddr(), callerpc, abi.FuncPCABIInternal(chansend))
    }

    // 如果与 select 搭配 && channel 未关闭 && 满了，不阻塞直接返回
    if !block && c.closed == 0 && full(c) {
       return false
    }

    var t0 int64
    if blockprofilerate > 0 {
       t0 = cputicks()
    }
    
    // 加锁
    lock(&c.lock)

    // 如果已经关闭，你还调用了 send，则直接 panic
    if c.closed != 0 {
       unlock(&c.lock)
       panic(plainError("send on closed channel"))
    }
    
    // 优先从 read 队列中获取一个等待的 goroutine，直接把数据给它
    if sg := c.recvq.dequeue(); sg != nil {
       // Found a waiting receiver. We pass the value we want to send
       // directly to the receiver, bypassing the channel buffer (if any).
       send(c, sg, ep, func() { unlock(&c.lock) }, 3)
       return true
    }
    
    // read 队列中没有 goroutine
    // 判断数据是否已满，没满可以把数据放在缓冲区后返回
    if c.qcount < c.dataqsiz {
       // Space is available in the channel buffer. Enqueue the element to send.
       qp := chanbuf(c, c.sendx)
       if raceenabled {
          racenotify(c, c.sendx, nil)
       }
       typedmemmove(c.elemtype, qp, ep)
       c.sendx++
       if c.sendx == c.dataqsiz {
          c.sendx = 0
       }
       c.qcount++
       unlock(&c.lock)
       return true
    }
    // 缓冲区满了 && 与 select 一起用则直接返回
    if !block {
       unlock(&c.lock)
       return false
    }
    
    // 满了 && 正常使用则将此 goroutine 阻塞
    // 将 goroutine 封装为 sudog，放入写队列
    gp := getg()
    mysg := acquireSudog()
    mysg.releasetime = 0
    if t0 != 0 {
       mysg.releasetime = -1
    }
    mysg.elem = ep
    mysg.waitlink = nil
    mysg.g = gp
    mysg.isSelect = false
    mysg.c = c
    gp.waiting = mysg
    gp.param = nil
    c.sendq.enqueue(mysg)
    gp.parkingOnChan.Store(true)
    gopark(chanparkcommit, unsafe.Pointer(&c.lock), waitReasonChanSend, traceBlockChanSend, 2)
    // 保证数据不会被 gc
    KeepAlive(ep)

    // 此 goroutine 被唤醒
    // 写队列中的 goroutine 只能被读 goroutine 唤醒
    if mysg != gp.waiting {
       throw("G waiting list is corrupted")
    }
    gp.waiting = nil
    gp.activeStackChans = false
    closed := !mysg.success
    gp.param = nil
    if mysg.releasetime > 0 {
       blockevent(mysg.releasetime-t0, 2)
    }
    mysg.c = nil
    releaseSudog(mysg)
    // 此 goroutine 阻塞阶段，channel 被关闭，当前 goroutine 会panic
    if closed {
       if c.closed == 0 {
          throw("chansend: spurious wakeup")
       }
       panic(plainError("send on closed channel"))
    }
    return true
}
```

流程根据 channel 的使用场景分为两种 ：当 channel 与 select 搭配时，该阻塞的地方全都直接返回。

正常使用 channel 进行写入时 ：

1. channel == nil 则阻塞
2. 加锁
3. channel 已关闭则 panic
4. 读队列有阻塞的goroutine ：从读队列中取出 goroutine，将数据直接给它
5. 缓冲区未满，插入
6. 若缓冲区满了，goroutine 阻塞等待被唤醒，醒了后再次判断 channel 是否关闭，已关闭则 panic，未关闭则写入。

### 3.5 chanrecv

```Go
func chanrecv1(c *hchan, elem unsafe.Pointer) {
    chanrecv(c, elem, true)
}
```

第三个参数 block 跟上面一样

```Go
func chanrecv(c *hchan, ep unsafe.Pointer, block bool) (selected, received bool) {
    if debugChan {
       print("chanrecv: chan=", c, "\n")
    }
    // channel 为 nil 时读取将被阻塞
    if c == nil {
       if !block {
          return
       }
       gopark(nil, nil, waitReasonChanReceiveNilChan, traceBlockForever, 2)
       throw("unreachable")
    }

    if c.timer != nil {
       c.timer.maybeRunChan()
    }
    
    if !block && empty(c) {
       if atomic.Load(&c.closed) == 0 {
          return
       }

       if empty(c) {
          // The channel is irreversibly closed and empty.
          if raceenabled {
             raceacquire(c.raceaddr())
          }
          if ep != nil {
             typedmemclr(c.elemtype, ep)
          }
          return true, false
       }
    }

    var t0 int64
    if blockprofilerate > 0 {
       t0 = cputicks()
    }
    // 加锁，线程安全
    lock(&c.lock)
    
    // channel 已关闭
    if c.closed != 0 {
       // 没有数据
       if c.qcount == 0 {
          if raceenabled {
             raceacquire(c.raceaddr())
          }
          unlock(&c.lock)
          if ep != nil {
             typedmemclr(c.elemtype, ep)
          }
          return true, false
       }
       // The channel has been closed, but the channel's buffer have data.
    } else {
    // channel 未关闭
       // 直接从写阻塞队列拿一个 sudog，将它携带的值给当前读goroutine
       if sg := c.sendq.dequeue(); sg != nil {
          recv(c, sg, ep, func() { unlock(&c.lock) }, 3)
          return true, true
       }
    }
    
    // 上面都没走，说明channel未关闭，且没有写阻塞队列
    // 如果缓冲区内有数据，拿到手返回
    if c.qcount > 0 {
       qp := chanbuf(c, c.recvx)
       if raceenabled {
          racenotify(c, c.recvx, nil)
       }
       if ep != nil {
          typedmemmove(c.elemtype, ep, qp)
       }
       typedmemclr(c.elemtype, qp)
       c.recvx++
       if c.recvx == c.dataqsiz {
          c.recvx = 0
       }
       c.qcount--
       unlock(&c.lock)
       return true, true
    }
    // 没有数据，判断要不要阻塞
    if !block {
       unlock(&c.lock)
       return false, false
    }

    // 阻塞了
    gp := getg()
    mysg := acquireSudog()
    mysg.releasetime = 0
    if t0 != 0 {
       mysg.releasetime = -1
    }

    mysg.elem = ep
    mysg.waitlink = nil
    gp.waiting = mysg

    mysg.g = gp
    mysg.isSelect = false
    mysg.c = c
    gp.param = nil
    c.recvq.enqueue(mysg)
    if c.timer != nil {
       blockTimerChan(c)
    }

    gp.parkingOnChan.Store(true)
    gopark(chanparkcommit, unsafe.Pointer(&c.lock), waitReasonChanReceive, traceBlockChanRecv, 2)

    // 被唤醒了
    if mysg != gp.waiting {
       throw("G waiting list is corrupted")
    }
    if c.timer != nil {
       unblockTimerChan(c)
    }
    gp.waiting = nil
    gp.activeStackChans = false
    if mysg.releasetime > 0 {
       blockevent(mysg.releasetime-t0, 2)
    }
    success := mysg.success
    gp.param = nil
    mysg.c = nil
    releaseSudog(mysg)
    return true, success
}
```

### 3.6 closechan

```Go
func closechan(c *hchan) {
    // channel == nil 时进行 close 会 panic
    if c == nil {
       panic(plainError("close of nil channel"))
    }
    // 加锁
    lock(&c.lock)
    
    // double close 会 panic
    if c.closed != 0 {
       unlock(&c.lock)
       panic(plainError("close of closed channel"))
    }

    if raceenabled {
       callerpc := getcallerpc()
       racewritepc(c.raceaddr(), callerpc, abi.FuncPCABIInternal(closechan))
       racerelease(c.raceaddr())
    }
    // close 标志位置为1
    c.closed = 1

    var glist gList
    
    // 释放所有读阻塞队列中的协程
    for {
       sg := c.recvq.dequeue()
       if sg == nil {
          break
       }
       if sg.elem != nil {
          typedmemclr(c.elemtype, sg.elem)
          sg.elem = nil
       }
       if sg.releasetime != 0 {
          sg.releasetime = cputicks()
       }
       gp := sg.g
       gp.param = unsafe.Pointer(sg)
       sg.success = false
       if raceenabled {
          raceacquireg(gp, c.raceaddr())
       }
       glist.push(gp)
    }

    // 释放所有写阻塞队列的 goroutine，
    // 此时它们都会苏醒，然后都会触发 panic，无法将数据放入缓冲区
    // 所以调用 close 后，读协程只会读到缓冲区剩余的数据，如果没有就读到默认值
    for {
       sg := c.sendq.dequeue()
       if sg == nil {
          break
       }
       sg.elem = nil
       if sg.releasetime != 0 {
          sg.releasetime = cputicks()
       }
       gp := sg.g
       gp.param = unsafe.Pointer(sg)
       sg.success = false
       if raceenabled {
          raceacquireg(gp, c.raceaddr())
       }
       glist.push(gp)
    }
    unlock(&c.lock)

    // Ready all Gs now that we've dropped the channel lock.
    for !glist.empty() {
       gp := glist.pop()
       gp.schedlink = 0
       goready(gp, 3)
    }
}
```