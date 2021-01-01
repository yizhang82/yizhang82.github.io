# Paper Reading: A Scalable Concurrent malloc(3) Implementation for FreeBSD

This is a great paper that shows why writing a sclable multi-threaded implementation is a hard problem. For something as well researched and "simple" (at least at a fist glance) as allocators, it is rather difficult to write a allocator that scales on multi-core, have low overhead and minimal fragmentation, and works well across a wide variety of application workloads. This paper talks about how jemalloc addresses those issues. We'll also look at an related jemalloc post at Facebook as well towards the end. Very few of us would probably have to write an allocator from scratch, but the principles here can easily be applied to many multi-threaded applications.

You can find the PDF link [here](https://www.bsdcan.org/2006/papers/jemalloc.pdf).

## Writing allocators is hard

phkmalloc works well but designed when multi-processor system is rare and as a reslut it doesn't scale well. 

Perhaps one of the most surprising (but makes sense once you think about it) thing is: Allocators needs to be measured with real world applications, and just measuring the allocator isn't enough - the memory layout (as a result of the allocator and application allocation pattern) impacts application performance as well, due to CPU cache, paging. As a result you'd need to measure execution time and memory usage of real applications. You also need to measure a wide variety of applications to catch degenerative corner cases, which are probably hard to avoid but at least you'd need to make conscious trade-offs.

> This is true for garbage collectors as well.

Allocators ideally needs to minimize both external fragmentation (memory used in virtual memory but not used by the application) and internal fragmentation (from allocations), but sometimes need to make trade-offs.

RAM has become significantly cheaper, so it makes more senes to optimize for cache locality rather than minimizing working set. Working set reduction is important (as it leads to more paging) and may also lead to better cache locality, but not always. Objects allocated together tends to be used together, so better packing may lead to better cache locality. Total memory usage is a good proxy for cache locality, so jemalloc optimizes for reducing overall memory usage and allocating contiguously is a secondary concern if it doesn't conflict with the first goal.

Having multile CPU concurrently manipulating objects in same cache line will lead to false cache line sharing which may seriously degrade performance. Pushing locking down in allocators and having multiple free list with their own locks helps, but still leads to quick cache migration between processors. Having per-CPU arena for allocation that hashes with thread identifiers works well in practice. Jemalloc use round-robin instead of hashing.  

> Many of the same principles / techniques applies generally to multi-thread data structures that scales well. 

## Jemalloc algorithm and data structures

jemalloc supports configuration with `/etc/malloc.conf`, `MALLOC_OPTIONS` environment variable, or `_malloc_options` global variable. At runtime application has a fixed number of allocators, which by default depending on number of processors, typically 4x. The arena is assigned in a round-robing fashion. In thoery one could do dynamic balancing but book keeping itself may end up being costly. Implementation typically relies on TLS (Thread Local Storage) or TSD (Thread-specific Data).

Memory are requested in chunks with `sbrk` or `mmap`, with its address aligned with chunk size to make address calculation easier. Chunk default at 2MB.

Allocations are divded into small, large, and huge. All request are rounded to nearest class size boundary. You can see the different size classes here:

Category | Sub-Category | Size
---------|--------------|-----
Small | Tiny | 2B ~ 8B
| | Quantum-Spaced | 16B ~ 512B
| | Sub-Page | 1KB ~ 2KB
Large | | 4KB ~  1MB
Huge | | >= 2MB

Small/large allocations are done within chunks from page runs using binary buddy algorithm. The runs can be split or coalesced. Large allocations are larger thar half of a page but smaller than half of a chunk. Each chunk saves its run information in the beginning as a header (with the exception of small size classes)

Small allocation falls into 3 sub-categories: tiny, quantum-spaced, sub page. For most applications allocation of small objects less than 512 bytes are most common, so it makes sense to have power of 2 sub classes from 2B to 512B. Region bitmap is stored in beginning of each run, which are more space efficient than free lists. This also increases application locality and reduces likelihood of corrpution.

Huge allocations are larger than half of chunk and backed by one or more contiguous chunks, managed separately by a red-black tree. Application rarely allocates memory of such size so contention is usually not an issue. 

## Bonus

As per this [Facebook Engineering blob post](https://engineering.fb.com/2011/01/03/core-data/scalable-memory-allocation-using-jemalloc/), there are a few additional details are that interesting not covered in this paper.

First, even though Arenas are assigned to thread at round-robin, typically you would still have multiple thread sharing the same Arena (due to overhead of maintaining arenas), so jemalloc adds thread cache (called *tcache*) that are truly per thread, which is basically a cache of small objects as well as large objects up to a certain limit (32KB by default). Allocation requests first check thread cache first with zero locking, and then fallback to arena. Unused cached objects are subject to garbage collection to reduce fragmentation. 

The post has an excellent diagram tieing everything together:

![jemalloc diagram](/imgs/paper-jemalloc-2.jpg)

Facebook also added a few improvements:
* rewrote thread caching with a simple FIFO design
* more fine grained mutex and dropping mutex during syscalls
* rewrote dirty page purging
* a better red-black tree implementation 

## Allocator matters

It is best to close this with a picture from the earlier blog post which shows how much allocator impacts application throughput. 

![allocator_perf](paper-jemalloc-1.jpg)