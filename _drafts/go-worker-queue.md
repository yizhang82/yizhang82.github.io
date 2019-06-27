---
layout: post
title:  "Go pattern for worker queue"
description: "A quick case study for go concurrency"
permalink: go-pattern-for-worker-queue 
comments: true
excerpt_separator: <!--more-->
categories:
- go 
- threading 
- concurrency 
---

# Go pattern for worker queue - a quick case study for go concurrency

A classical computer science problem is a worker queue - imagine you have N WorkItems to be divided between M workers (of course this implies N >> M). This pattern has many application such as generating lots of data and insert into database, processing CPU-intensive work, etc. This can be easily achieved with go routine and channels. I recently spend a bit of time working on a similar problem with go and I'd like to share the pattern that I came up with. 

<!--more-->

> Why M workers instead of firing just N go routines? In many cases all these workers are completing for resources (I/O, CPU, memory, etc) and those resources are always finite (no matter how many go routines you can launch). Though go routines are lightweight threads (or green threads, to be more exact), those resource limitation still apply and having many go routine competing for them would only slow you down since you'll spend all the time doing context swap, and increasing the contention. The good old thread-pool concept still applies today, even for go. The advantage of go is that you can launch many go routines as long as they are not *actively* doing work - blocking is (almost) free. 

Here is the full source code:

```go
package main

import (
    "log"
	"sync"
	"time"
)

type workItem struct {
    work int
}

func work(workItemCount int, workers int) {
    // Create a channel with buffer = workItemCount
    workChan := make(chan workItem, workItemCount)

    var wg sync.WaitGroup

    // Populate the work items
    for i := 0; i < workItemCount; i++ {
        workChan <- workItem{i} 
    }

    // Launch workers
    log.Println("Launching workers...")
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func(worker int) {
            log.Printf("[Worker %d] Started", worker)
            defer wg.Done()
            for true {
                workItem, more := <-workChan
                if more {
                    // We've got work
                    doWork(worker, workItem)
                } else {
                    // No more work to do
                    log.Printf("[Worker %d] No more work to do", worker)
                    break
                }
            }
            log.Printf("[Worker %d] Terminated", worker)
        }(i)
    }

    // Close the channel and wait for all waiters to finish
    close(workChan)
    wg.Wait()
}

func doWork(worker int, work workItem) {
	log.Printf("[Worker %d] Working on %d\n", worker, work.work)
	// Simulate work
	time.Sleep(10 * time.Millisecond)
    log.Printf("[Worker %d] Completed %d\n", worker, work.work)
}

func main() {
  work(1000, 10)
}
```

So let's go through the code piece by piece.

The work is being done through the `work` function, passing the number of work items (N) and the number of workers (M):

```go
func work(workItemCount int, workers int) {
```

We start by creating a channel that holds workItem values. The workItem can be whatever you define. In code I've simplified it to be just an ID but in practice it can be a range of possible values.

```go
    // Create a channel with buffer = workItemCount
    workChan := make(chan workItem, workItemCount)
```

One thing to keep in mind is that we choose to create a channel with workItemCount buffer, that is big enough to hold all the work item at once. You might be able to optimize space by reducing the buffer to a multiple of workerCount (say 2) and having another go routine to generate the workItem as needed. But in many cases what we have here is good enough.

This generates the work. Note that if you don't have enough in the buffer this can block (and couldn't make any further progress since we haven't launched go routines yet). If that's the case you can launch this as a go routine instead. But in this case there is no such need.

```go
    // Populate the work items
    for i := 0; i < workItemCount; i++ {
        workChan <- workItem{i} 
    }
```

Now we are launching the workers:

```go
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func(worker int) {
            defer wg.Done()

            //...
        }(i)
    }
```

Note we use the `sync.WaitGroup` class as a counter to wait for all go routines to finish. They'll finish if the channel is closed and there are no more work.

The go routine code is quite simple - get work from the channel, and see if we have more work to do. The real work is done inside doWork.

```go
            for true {
                workItem, more := <-workChan
                if more {
                    // We've got work
                    doWork(worker, workItem)
                } else {
                    // No more work to do
                    log.Printf("[Worker %d] No more work to do", worker)
                    break
                }
            }
```

> If you are curious - you might notice that we are doing a tight loop without doing any explicit blocking operation. However because reading from a channel here is a blocking operation, if there are tempoarily no more work the go routine would block until there are more work arrive. Though in this case since we always pre-populate the work there are always work to do until all the work are finished.

There is one bit of interesting detail here. Note that we are passing the `i` value to the go routine instead of referencing it directly:

```go
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func(worker int) {
            // ...
            doWork(worker, workItem)
            // ...
        }(i)
    }
```

While you could simply do:

```go
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            // ...
            doWork(i, workItem)
            // ...
        }()
    }
```

Does that work?

Unfortunately no. This is a very common problem with lambda expressions. When the i gets "captured" inside the go routine, it is captured by reference, meaning that the value of i inside go routine changes with the i from the loop (the go routine `i` is an alias of the loop `i`, or rather the go routine `i` is a pointer to the loop `i`, if you come from a C/C++ background). So this effectively means that the `i` inside go routine would change as the loop progresses, and you'd observe interesting output like the following:

```
[Worker 9] Working on ...
[Worker 2] Working on ...
...
[Worker 10] Working on ...
[Worker 10] Working on ...
[Worker 10] Working on ...
[Worker 10] Working on ...
... -> All them are [Worker 10]
```

That it seems only worker 10 gets the job done from very early on. But that's just the `i` value - all the other workers are getting work done, but they are reporting themselves with `i` that has already progressed to 10.

OK. Now that we are done with the workers, we need to wait for all of them to finish:

```go
    // Close the channel and wait for all waiters to finish
    close(workChan)
    wg.Wait()
```

It's important to close the channel here so that when all the workItem are retrieved from the channel all the go routines will exit, and therefore calling `WaitGroup.Done`, eventually `WaitGroup` would have a 0 value and `wg.Wait()` would complete.

## Summary

Go is a great language for writing utilities and services. The elegance and efficiency of go routine (as well as explicit error handling, low-latency garbage collection, defered execution, among other things) really hit it home for me. Though I'm not writing Go as my main job (that'd be the good old C++), I'm planning to sneak in more Go utilities whenever possible. I'm planning to write more about Go and dive deeper into its language features and internals when I get a chance. Language and Runtime is still my favorite topic (though these days I'm more a database guy). Stay tuned! 



