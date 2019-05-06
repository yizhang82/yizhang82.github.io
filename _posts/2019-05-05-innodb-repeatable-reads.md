---
layout: post
title:  "Repeatable reads in InnoDB comes with a catch"
description: 
permalink: innodb-repeatable-read 
comments: true
excerpt_separator: <!--more-->
categories:
- database 
- innodb
- transaction
- threading
---

A few days ago I was looking into a deadlock issue that is caused by a behavioral difference between MySQL storage engine transaction behavior in repeatable reads. This leads me to dig deeper into repeatable read behavior in InnoDB and what I found is quite interesting: 

## The basics

Before we dig deeper, let's revisit some of the basics of database isolation levels. You can refer to my [earlier post](https://yizhang82.dev/db-isolation-level) for a more detailed explanation / comparison. Database isolation level defines the behavior of data read/write operations within transactions, and those can have a signficant impact to protecting the data integrity of your application. *Repeatable reads* guaratees that you would always observe the same value once you read it, and it would never change unless you've made the change yourself, giving you the illusion that it is exclusively owned by you and there is no one else. Of course, this isn't true in practice as there are pessimistic locking and optimistic locking that defines the behavior when write conflict occurs. 

<!--more-->

Anyway, let's look at some concrete examples with InnoDB where the default is repeatable read with pessimistic locking. All the examples below are captured using InnoDB and the discussion are strictly for InnoDB only. For the database engine we care about (MyRocks) I'll talk about it some other time.

Let's begin by creating the table and give it some data

```
mysql> create table t1 (pk int primary key, count int);
Query OK, 0 rows affected (0.33 sec)

mysql> insert into t1 values (1, 0);
```

Start the transaction and observe the value:

```
SESSION1> begin;
Query OK, 0 rows affected (0.00 sec)

SESSION1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     0 |
+----+-------+
1 row in set (0.00 sec)

```

The value is still 0, not surprising. 

Now lets' change it outside of transaction from another client session:

```
SESSION2> update t1 set count=2 where pk=1;
Query OK, 1 row affected (0.08 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

And look inside transaction:

```
SESSION1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     0 |
+----+-------+
1 row in set (0.00 sec)
```

You'll see that the value is unchanged, as required by repeatable reads.

Now when we update it in SESSION1:

```
SESSION1> update t1 set count=1 where pk=1;
Query OK, 1 row affected (0.00 sec)
Rows matched: 1  Changed: 1  Warnings: 0

SESSION1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     1 |
+----+-------+
1 row in set (0.00 sec)
```

And the new value becomes 1 and the latest value 2 gets overwriten. Row (1, 1) becomes locked.

So if you try to update it anywhere else:

```
SESSION2> update t1 set count=count+1 where pk=1;
(waiting for SESSION1 to commit)
```

It'll stuck waiting for SESSION1 to commit.


```
SESSION1> commit;
Query OK, 0 rows affected (0.00 sec)
```

Come back to session2 and notice the update command has finished:

```
SESSION2> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     2 |
+----+-------+
1 row in set (0.00 sec)
```

Note the value has now become 3.  

Also, keep in mind that repeatable reads doesn't necessarily protect you from corrupting the data as read itself doesn't take any locks. So it is possible for someone else to update the data without you knowing about it, and you may end up ovewriting that new value without accouting for the new value.

## count=count+1

Now let's change the updates to `UPDATE SET count=count+1`, the behavior becomes much more interesting. 


Again start with SESSION1 (assuming we reset everything back to 0):

```
SESSION1> begin;
Query OK, 0 rows affected (0.00 sec)

SESSION1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     0 |
+----+-------+
1 row in set (0.00 sec)
```

Now update it in another session:

```
SESSION2: update t1 set count=5 where pk=1;
Query OK, 1 row affected (0.05 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

Come back to SESSION1, and use UPDATE to increment the value:

```
mysql> update t1 set count=count+1 where pk=1;
qQuery OK, 1 row affected (23.15 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

Now what do you think? What's the value of count now?

Based on our discussion above, it should be 0 + 1 = 1. However, that's not what we get here:

```
mysql> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     6 |
+----+-------+
1 row in set (0.00 sec)
```

Clearly it is reading from the latest value instead of the 0 value we read earlier!

It turns out InnoDB actually has two kind of reads: [CONSISTENT READ](https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html) and [LOCKING READ](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html). The reads when you do in UPDATE, SELECT FOR UPDATE, SELECT FOR SHARED LOCK are locking reads. 

Consistent read when you read without a lock and reads the snapshot established in the transaction, (1, 0) in this case. Locking read would actually read the latest data and act as if this were read-committed. 

Strictly speaking, this isn't quite repeatable read as the view of count clearly was read from outside transaction (as if were read committed) *AFTER* seeing a earlier value. Technically, you can say there are really two snapshots - the read snapshot for regular reads and the latest snapshot for locking reads, and each snapshot itself follows repeatable reads. However, that is still a departure from regular repeatable reads.

To better illustrate this behavior, let's look at consistent reads vs locking reads more closely:

Again, let's start with a new transaction in SESSION1 with everything reset back to 0:

```
SESSION1> begin;
Query OK, 0 rows affected (0.00 sec)

SESSION1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     0 |
+----+-------+
1 row in set (0.00 sec)
```

In session2 lets update count to 1:

```
SESSION2> update t1 set count=count+1 where pk=1;
Query OK, 1 row affected (0.01 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

Come back to SESSION1 and let's lock t1 for update while observing its latest value:

```
SESSION1> select * from t1 for update;
+----+-------+
| pk | count |
+----+-------+
|  1 |     1 |
+----+-------+
1 row in set (0.00 sec)
```

You can see with update lock you are seeing the latest value 1. 

And if you read without the lock:

```
SESSION1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     0 |
+----+-------+
1 row in set (0.00 sec)
```

You are back to 0. So you can actually see both values at the same time!

However, only the '1' value is safe because once a update lock is obtained no one can update it anymore so it's guarateed to be up-to-date.

Now update it using `UPDATE SET count=count+1`:

```
SESSION1> update t1 set count=count+1 where pk=1;
Query OK, 1 row affected (0.01 sec)
Rows matched: 1  Changed: 1  Warnings: 0

SESSION1> select * from t1 for update;
+----+-------+
| pk | count |
+----+-------+
|  1 |     2 |
+----+-------+
1 row in set (0.00 sec)

SESSION1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     2 |
+----+-------+
1 row in set (0.00 sec)
```

You can see as we have modified the value in transaction, in all cases you'll observe the modified value (in write-set) in the transaction. 

## My speculation

I haven't spoke to Oracle about this so the following is just my speculation. Enfocing strict repeatable reads is very nice and correct in theory, but in practice it can be somewhat counter-productive. Imagine this case:

```
BEGIN;
SELECT ... from other_table;
... some other stuff ...
UPDATE order_count SET count=count+1 where order=some_order;
COMMIT;
```

Doing a SELECT estblishes a snapshot for everything - this is needed to avoid inconsistency between the tables even though you may have never read count. This effectively means that your chance of count being out-of-date is now between the SELECT and the UPDATE! However, note that this protection is entirely unnecessary in this case because UPDATE will perform locking read of count when doing count=count+1, effectively protecting update being changed until end of the transaction.

This locking-read behavior can also be useful when you are doing "atomic-compare-exchange" style operations as they can look at the latest value to see if something has changed:

```
BEGIN;
SELECT count from count_table into @old_count_value
UPDATE count_table SET count=count+1 where id=order_id and count=@old_count_value;
COMMIT;
```

Even though this feature can be useful, it does introduce additional complexity with InnoDB repeatable reads and may introduce potential data conflict if one were not careful and is not aware of the difference between locking reads and consistent reads. It tries to find a reasonable compromise between strict correctness and practicality. It's hard to say if it achieved the goal - one may simply never know without careful / extensive instrumentation. I just kinda wish that this isolation level can be called something else, though many database isolation level definition are quite different and you can't take them at face value anyway,  so that's a ship already sailed...
