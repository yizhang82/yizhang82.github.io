


# Read committed

This is the most basic level of isolation. You'll get:

* No dirty reads: you'll only see data that has been modified and committed

This means that you won't observe any data changes in progress, until they are committed.

* No dirty writes: you'll only overwrite data that has been modified and committed

This means that you won't overwrite other people's inflight writes - no two writes will conflict with each other and only one will succeed. 

# Repeatable reads

Whenever you read data, it's held by a lock until the end of transaction. This prevents other transactions from modifying the data after being read from this transaction - resulting in non-repeatable reads.

The statement above effectively means that once you read some data, it's froze and no one else can change that data. You never see inconsistencies in terms of data you've already seen. This is probably most natural for people that comes in from regular programming languages and closely resemble a single-thread model. 


# Snapshot Isolation

Whenever you read data, it'll be the version existed at the start of transaction. Modification by other transactions are not seen by current transaction. The easiest way to think about this is that the data is sort of frozen once you enter the transaction.

This means that data reads don't require any locks (since they can't be changed by other transactions, except by this transaction), and it'll always be consistent, it's great for scenarios where you do a processing that covers a lot of data in the background without being interfered with other writers.

Of course, your writes are still subject to the lock to prevent dirty writes.

# Summary

 Model             | Read             | Write         | Isolation
----------         | -----            | ------        | --
| Non-repeatable read | 
| Repeatable-read  | Read takes read lock until end of transaction | Write takes write lock | WriteSet
| Snapshot         | Read takes no lock | Write takes lock preventing dirty writes | WriteSet / MVVC
| 

