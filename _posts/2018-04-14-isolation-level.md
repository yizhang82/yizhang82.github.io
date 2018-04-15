---
layout: post
title:  "Summary of database isolation levels"
description: Summary of different database isolation levels
permalink: db-isolation-level
comments: true
excerpt_separator: <!--more-->
categories:
- database
- concurrency
- lock
- transaction
---

I've been always a bit confused about different isolation levels on databases. So I spent a bit of time going through them and summarize it in a post. This is both for myself and also hopefully will help others looking for similar information as well.

In this post we'll talk about:

* Meaning of different isolation levels - read committed, repeatable reads, snapshot isolation, serializable
* How they use locks inside transactions
* How they affect performance

<!--more-->

Let's take a look at all the different isolation levels.

## Read committed

This is the most basic level of isolation. You'll get:

* No dirty reads: you'll only see data that has been modified and committed

This means that you won't observe any data changes in progress, until they are committed.

This is usually implemented using *WriteSet*. Before transctions are committed, their writes are stored in a *WriteSet* containing all changes inflight, and won't be see by other transactions. Only when the transaction get committed, the data stored in WriteSet will get applied to the actual data, making the changes "real". Transaction aborts are also quite straight-forward in this case - just throw away the changes in WriteSet. 

* No dirty writes: you'll only overwrite data that has been modified and committed

This means that you won't overwrite other people's inflight writes - no two writes will conflict with each other and only one will succeed. In other words, the write is atomic.

Note that this provides no guarantee of consistency - people can still overwrite each other's data concurrently (let's say a counter). It's just that the write will be atomic so only one write will win. 

## Repeatable reads

Whenever you read data, it's held by a lock until the end of transaction. This prevents other transactions from modifying the data after being read from this transaction - resulting in non-repeatable reads.

The statement above effectively means that once you read some data, it's froze and no one else can change that data. You never see inconsistencies in terms of data you've already seen. This is probably most natural for people that comes in from regular programming languages and closely resemble a single-thread model.

## Snapshot Isolation

Whenever you read data, it'll be the version existed at the start of transaction. Modification by other transactions are not seen by current transaction. The easiest way to think about this is that the data is sort of frozen once you enter the transaction.

This means that data reads don't require any locks (since they can't be changed by other transactions, except by this transaction), and it'll always be consistent, it's great for scenarios where you do a processing that covers a lot of data in the background without being interfered with other writers.

Of course, your writes are still subject to the lock to prevent dirty writes. In some systems, snapshot isolation also provides conflict detection and automatically aborts the transaction is a conflict is detected.

Snapshot isolation are typically implemented using [MVCC](https://en.wikipedia.org/wiki/Multiversion_concurrency_control). All writes in the system will be tracked by global timestamp / version number. Whenever you start your transaction you get a global timestamp/version number and that effectively "froze" your world. Whenever you read you'll be reading data that is written earlier than / equal to that timestamp/version number. For write conflicts you can either use lock or use read version number to detect and abort.

## Serializable

Operations are performed in a way that has the same effect as if they are executed in a serialized fashion. This effectively means that if you read some data, it cannot be modified by other transactions, and vice versa - basically disallowing any concurrency between read/write and write/write. Concurrent reads are still OK. 

This model is mostly natural to people don't have a lot of background in database programming because it'll protect them from making concurency/isolation related mistakes. The downside is that your code could easily run into deadlock if two transaction are reading/writing in parallel. Usually this gets "resolved" by a timeout (poor man's deadlock detection), but this means the work being done is wasted and the transaction need to start over. But hey, at least it's safe!

We'll talk more about this deadlock in the update lock section below.

## Isolation and Locks

When operating data on diffrent isolation levels, database typically implement isolation level using a combination of locks and MVCC techniques. Let's take a look at lock first. There are usually 3 kinds of locks:

* Shared

You can think of this as a read lock. Readers take read lock and only conflict with writers (who take exclusive lock).

* Exclusive

Think of this as a writer lock. Only one writer can enter at the same time - it blocks other writers and readers for the duration of the lock.

* Update

This is a asymetric lock used to prevent a common form of deadlock.

1. A take shared lock on row X, and read row X
2. B take shared lock on row X, and read row X
3. A try to write to row X by taking exclusive lock on row X, but blocks on shared lock from B
4. B try to write to row X by taking exclusive lock on row X, but blocks on shared lock from A

Now you got yourselve a deadlock, which typically results a timeout and wasted work.

Now let's see what happens if they take update lock:

1. A take update lock on row X, and read row X
2. B take update lock on row X, blocked by update lock on row X
3. A take exclusive lock on row X, granted, and updates row X, release the lock
4. B wake up and update lock granted, and proceed to update row X

Now you can see there are no more deadlocks and no more wasted work being done. There are still contention - that's unavoidable in this model.

Also, note that update lock allows concurrent readers - so it's better than if you take exclusive lock for reads upfront.

# Summary

 Model             | Read                     | Write       | Risk | Performance under high concurrency **
----------         | ---------------------    | ------      | -----| -----
| Read committed | Take shared lock and release once read completes | Write take exclusive lock and release once write completes | Non-repeatable reads, Read skew | Read/Read: Good, Read/Write: Good, Write/Write: Good
| Repeatable-read  | Takes shared lock until end of transaction | Write takes exclusive lock and release once write completes | Phantoms / Write Skew | Read/Read: Good, Read/Write: Poor, Write/Write: OK
| Snapshot         | No lock | Takes exclusive lock and release once write completes | Reading stale (but consistent) data, Phantoms / Write Skew | Read/Read: Good, Read/Write: Good, Write/Write: Poor
| Serializable (Two phase Locking) | Take shared lock until end of transaction  | Take exclusive lock until end of transaction | Deadlock | Read/Read: Good, Read/Write: Poor, Write/Write: Poor
| Serializable snapshot (Optimisitic) | No lock | No lock | Reading stale (but consistent) data, lot of aborts under high-contention | Read/Read: Good, Read/Write: Poor, Write/Write: Poor

** Those description for performance is only a simplification for illustration purpose only - performance is a complicated topic.