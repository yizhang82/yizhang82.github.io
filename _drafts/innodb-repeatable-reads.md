---
layout: post
title:  "Repeatable reads in InnoDB"
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

Repeatable reads = ...

## The basics


```
mysql> create table t1 (pk int primary key, count int);
Query OK, 0 rows affected (0.33 sec)
```

```
TXN1> begin;
Query OK, 0 rows affected (0.00 sec)

TXN1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     0 |
+----+-------+
1 row in set (0.00 sec)

```

```
mysql> update t1 set count=count+1 where pk=1;
Query OK, 1 row affected (0.08 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

```
TXN1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     0 |
+----+-------+
1 row in set (0.00 sec)
```

```
TXN1> update t1 set count=2 where pk=1;
Query OK, 1 row affected (0.00 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

```
TXN1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     2 |
+----+-------+
1 row in set (0.00 sec)
```

```
mysql> update t1 set count=count+1 where pk=1;
(waiting for TXN1 to commit)
```

```
TXN1> commit;
Query OK, 0 rows affected (0.00 sec)
```
```
mysql> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     3 |
+----+-------+
1 row in set (0.00 sec)
```


## A twist

```
TXN1> begin;
Query OK, 0 rows affected (0.00 sec)

TXN1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     0 |
+----+-------+
1 row in set (0.00 sec)
```

Now update it in another session:

```
mysql> update t1 set count=5 where pk=1;
Query OK, 1 row affected (0.05 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

Come back to TXN1, and use UPDATE to read the value:

```
mysql> update t1 set count=count+1 where pk=1;
qQuery OK, 1 row affected (23.15 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

Now what do you think: what's the value of count now?

If this were truly repeatable read, the value would've been 0 + 1 = 1. However, that's not what we get here:

```
mysql> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     6 |
+----+-------+
1 row in set (0.00 sec)
```

## A bigger twist

```
TXN1> begin;
Query OK, 0 rows affected (0.00 sec)

TXN1> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     0 |
+----+-------+
1 row in set (0.00 sec)
```

```
mysql> update t1 set count=count+1 where pk=1;
Query OK, 1 row affected (0.01 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```


Come back to TXN1:

```
mysql> select * from t1 for update;
+----+-------+
| pk | count |
+----+-------+
|  1 |     1 |
+----+-------+
1 row in set (0.00 sec)
```

And do it without the lock:

```
mysql> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     0 |
+----+-------+
1 row in set (0.00 sec)
```

What happens when you update it from here:

```
mysql> update t1 set count=count+1 where pk=1;
Query OK, 1 row affected (0.01 sec)
Rows matched: 1  Changed: 1  Warnings: 0

mysql> select * from t1 for update;
+----+-------+
| pk | count |
+----+-------+
|  1 |     2 |
+----+-------+
1 row in set (0.00 sec)

mysql> select * from t1;
+----+-------+
| pk | count |
+----+-------+
|  1 |     2 |
+----+-------+
1 row in set (0.00 sec)
```

You can see now the two snapshots actually merges.


It turns out InnoDB actually has two kind of reads:

CONSISTENT READ:

https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html


LOCKING READ:

https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html



