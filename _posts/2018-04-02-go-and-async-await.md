---
layout: post
title:  "Does Go need async/await?"
date:   2018-04-02
description: Does the go language need async/await support?
permalink: go-and-async-await
comments: true
excerpt_separator: <!--more-->
categories:
- async
- go
- concurrency
---

Recently I've been spending a bit of time playing with Go language. Coming from a C++ and C# background, I've been wondering what does C# async await (C++ coroutines, or node.js await/promise - pick your choice), would look like in Go. 

It turns out go does not need async/await - every thing can be synchronous by default. 

Let me explain why I arrived at this conclusion. 

But before that, let's take a look at why we need the async/await in the first place.

<!--more-->

## Sync everything

Ever since the introduction of threads, there have been many different models of how you write concurrent code in different languages.

The best example is perhaps I/O - you tell the operation system to write these 4096 bytes, and OS just does its magic, and come back saying "I'm done".

The most obvious way is to fire the write operation and then wait for the result to come back:

```cs
file.write(buffer)
```

Internally, it's probably more like this:

```cs
file.write(buffer, completionEvent);
completionEvent.wait();
```

This is pretty straightforward. But what's the downside?

Note it's not about wasting CPU resources. When a thread is blocked in waiting, OS is smart enough to suspend the thread, send it to a waiting list, and will wake it up if the resource it is waiting for get signaled. So it should not consume any CPU resources at all once it went to a deep sleep.

Basically, it comes down to cost of threads. Every time when a thread is blocked in waiting, if you want to do new work, you need to create new threads. This is even true if you have a thread pool - just imagine if every single one of them is blocked - and you still need to inject a new thread into the thread pool, essentially growing the pool.

Unfortunately, thread is not cheap. The OS has to allocate its own data structure for thread (TEB, TLS, etc), and a stack (reserve 1MB by default). Each thread when running also compete for CPU resources, and preemption is a full kernel context switch.

Also, you better not block the UI thread - user would be very sad if your app stops responding to inputs.

## Loop and events

Another common way to address this is to have a event loop. This is mostly common in UI threads where naturally the UI thread is the one that responding to inputs and you don't want to block that. Node.js does this - there is only one thread and every body needs to do some work, and yield the thread to other work.

Let's assume we have a message loop. `file.write` doesn't block - instead it fires off the write operation, and completion of write operation sends a message that triggers OnSaveComplete:

```cs
main()
{
    application.DoEvents();
}

OnClickSave()
{
    file.write(buffer, saveCompleteMessage);
}

OnSaveComplete()
{
    // file write completed
    // do other stuff
}

```

Now if you need to write more:

```cs

OnSaveComplete()
{
    // file write completed
    file.write(buffer2, saveCompleteMessage2)
}

OnSaveComplete2()
{
    // file write2 completed
    ...
}

```

This looks pretty ugly. You can free up the thread to do other work, but the price you are paying is to break up your code into smaller, disjoint chunks. Your thread also becomes a giant switch/case, or a bunch of small `onThisEventDoThat` methods (which is really a switch/case in disguise).

## Callback hell

Imagine if `write` takes a callback:

```cs

file.write(buffer, () => {
    // write finished...
});

```

This doesn't look so bad. But again, if you try to write more buffer:

```cs

file.write(buffer, () => {
    // buffer written
    file.write(buffer2, () => {
        // buffer2 written
        ...
    });

});

```

This is commonly known as "callback hell". The code is less disjointed than the event version (they are grouped together, after all), but the nesting makes it pretty awkward. This is most often seen in JavaScript code, but other languages/framework can got into this situation as well (`boost.asio`, for example). 

## async / await

With C# async/await (or C++ coroutine, or javascript await/promise), you can write code as if they are synchronous:

```cs

await file.write(buffer);
await file.write(buffer2);
await file.write(buffer3);

```

Under the hood, the compiler creates a state machine that maintains where you are exactly (before first write, after first write, after 2nd write, etc), and can suspend when the IO is in progress, therefore free the thread to do more work, and resume when the IO is completed.

This is better than the models we have earlier that programmer writes (as if) synchronous code, and threads are not wasted because once "suspended" (in quotes because the thread doesn't suspend in the OS sense - it got "reused") thread can do other work. But there are also unfortunate costs:

* Async is infectious - any code that uses async needs to be called from async code (async all the way up) until at certain boundaries (thread start function, event loop, etc) where magic happens. Long story short, the reason being that the entire async call chain needs to participate in the suspension/resume process and create their own state machine in each level.

* Compiler gets much more complicated and not all features work. Because state machines.

* debugging is challenging without debugger support for async. Without them, you can easily see unrelated function show up in the same callback, because resuming essentially hijacks the stack to run another function, and this can nest very deep. Interestingly you can also run into stack overflow more often...

* there is non-trivial cost associated with async/await - every function now returns a task, "suspension" needs to allocate a task and return all the way up (which is why you need to have `async` keyword all the way up in the call chain - they all need to participate), code needs to now maintain additional states for state machine...

Note async/await is a very complicated topic and probably worth a separate post to dive into. But for now what we talked about is probably good enough for this post.

## The Go model

Go interestingly opt for a very different model. Amazingly, it achieves (mostly) the same benefits with async/await, but without many of the downsides. It does that through go routines.

Go routine is not a real thread. They are more like fibers - that they are mapped to OS threads in a M:N mapping (M go routines >>>> N OS threads) and they are scheduled by the Go runtime, and have their own stack. This has many interesting consequences:

* Go routines are cheap. There are no OS data structure allocated - just Go data structures that keep track of go routines, and with a small but growable stack. You can create hundres of thousands of go routines.

* Only GOMAXPROC hardware threads are running (this isn't always true if the thread is blocked in syscall / native code, but it is mostly true) at the same time. Even if you create ton of go routines - they don't compete for CPU. This is more or less like thread pool.

* Context switch are cheap. Just swap the registers, and pointing to a new stack, do some internal book keeping (you are switching the current thread, after all), you are done. No kernel context switches. Go also knows when your go routines may suspend, so it can optimize the code a bit more and doesn't need to restore all registers.

As a result, Go programmers can simply write *synchronous* code and forget about all the complexity of async/await/promise.

```go

file.write(buf)
file.write(buf2)
file.write(buf3)

```

Internally, `file.write` can be implemented using `sync.Cond` or a channel - it naturally suspends and go can reschedule another go routine to run on this hardware thread if it needs to block.

Of course, go routines is not without its own set of challenges - it's difficult to write a good scheduler in user mode that works in all cases (you can't preempt - everything is cooperative), growing stack tends to be rather expensive. Interestingly, infinite recursion can make your computer run out of memory in earlier version of Go, because the stack is growable infinitely. Either way, in my opinion Go's model greatly simplifies asynchronous programming (not to mention channels) by allowing programmers to write synchronous code, with often superior performance, and that alone is a great reason to give Go a try.

## Conclusion

Go in my opinion is a great language that got many things right - it is not afraid to make bold and sometimes contraversial choices, and is not yet another C# or Java (means that they are main-stream languages that made a lot of safe, main-stream choices). The most brilliant part is definitely concurrency. Having said that, there are also things I don't agree with. Maybe save that for another go language post. Thanks for reading!