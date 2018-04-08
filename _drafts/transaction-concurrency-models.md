




# Isolation Levels

## Read committed

This is the most basic level of isolation. You'll get:

* No dirty reads: you'll only see data that has been modified and committed

This means that you won't observe any data changes in progress, until they are committed.

* No dirty writes: you'll only overwrite data that has been modified and committed

This means that you won't overwrite other people's inflight writes - no two writes will conflict with each other and only one will succeed.

## Repeatable reads

Whenever you read data, it's held by a lock until the end of transaction. This prevents other transactions from modifying the data after being read from this transaction - resulting in non-repeatable reads.

The statement above effectively means that once you read some data, it's froze and no one else can change that data. You never see inconsistencies in terms of data you've already seen. This is probably most natural for people that comes in from regular programming languages and closely resemble a single-thread model.


## Snapshot Isolation

Whenever you read data, it'll be the version existed at the start of transaction. Modification by other transactions are not seen by current transaction. The easiest way to think about this is that the data is sort of frozen once you enter the transaction.

This means that data reads don't require any locks (since they can't be changed by other transactions, except by this transaction), and it'll always be consistent, it's great for scenarios where you do a processing that covers a lot of data in the background without being interfered with other writers.

Of course, your writes are still subject to the lock to prevent dirty writes.

## Serializable

Operations are performed in a way that has the same effect as if they are executed in a serialized fashion. 

# Implementing Isolation levels

## Isolation and WriteSet / MVCC



## Isolation and Locks

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

Now you got yourselve a deadlock.

Now let's see what happens if they take update lock:

1. A take update lock on row X, and read row X
2. B take update lock on row X, blocked by update lock on row X
3. A take exclusive lock on row X, granted, and updates row X, release the lock
4. B wake up and update lock granted, and proceed to update row X

You might be wondering - this isn't any different than exclusive lock, isn't it? Actually let's see what happens if there are other readers come in:

1. A take update lock on row X, and read row X
2. B take a shared lock on row X, and read row X
3. Both A and B are trying to get exclusive lock - only A can get the lock because update lock is asymetric - allows other reader to come in but give itself the priority when it comes to writes
4. B can only write once C is done writing to B

# Summary

 Model             | Read                     | Write       | Risk | Performance under high concurrency **
----------         | ---------------------    | ------      | -----| -----
| Read committed | Take shared lock and release once read completes | Write take exclusive lock and release once write completes | Non-repeatable reads, Read skew | Good
| Repeatable-read  | Takes shared lock until end of transaction | Write takes exclusive lock and release once write completes | Phantoms / Write Skew | OK
| Snapshot         | No lock | Takes exclusive lock and release once write completes | Reading stale (but consistent) data, Phantoms / Write Skew | Excellent for reads
| Serializable (Two phase Locking) | Take shared lock until end of transaction  | Take exclusive lock until end of transaction | Deadlock | Poor
| Serializable snapshot (Optimisitic) | No lock | No lock | Reading stale (but consistent) data, lot of aborts under high-contention | Poor under high-contention, good otherwise

** Those description for performance is only a simplification for illustration purpose only - performance is a complicated topic.