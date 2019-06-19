---
layout: post
title:  "Hacking MySQL #1 - overview of MySQL, and how to build/run test from source"
description: An overview of MySQL, as well as how to obtain source, build and run tests
permalink: hacking-mysql-1 
comments: true
excerpt_separator: <!--more-->
categories:
- mysql 
- database
- source 
---

# Hacking MySQL #1 - Overview, Building, and Testing

## Oerview

MySQL is one of the most widely used OpenSource relational databases and is used by many companies such as Amazon, Facebook, Google, Alibaba, etc. In my current job we deploy MySQL widely within the company, we had our MySQL 5.6 [own fork](https://github.com/facebook/mysql-5.6) and moving towards MySQL 8.0 currently in a [branch](https://github.com/facebook/mysql-5.6/tree/fb-mysql-8.0.13). We also have an "new" storage engine built on top of RocksDB, not surprisingly called [MyRocks](http://myrocks.io/), which lives under [storage/rocksdb](https://github.com/facebook/mysql-5.6/tree/fb-mysql-5.6.35/storage/rocksdb) folder in the MySQL 5.6 fork. 

On a 10000-feet view, the architecture of MySQL server looks like this:

1. Connection Management / Authentication
2. Table/Schema Management/Caching
3. SQL Parser
4. SQL Optimizer and Query Executioner
5. Execution Engine
6. Replication and logging

If you dive deeper, an execution engine itself could include following pieces:

1. Transaction / MVCC / Locking / Snapshot support
2. Schema/Metadata
3. In-memory core database data structure (B+ tree / LSM tree / etc) and operation (insert/delete/update) for records
4. Indexing data structures, and searching/updating
5. Logging, Checkpointing & Recovery
6. Database storage persistence
7. Caching (disk blocks/pages, etc)

One of the most amazing features in MySQL is to swap the underlying storage engine while keeping the same upper layers - this way you can have different in-memory and on-disk representation of databases for different workloads, while keeping the same SQL execution functionality so the client wouldn't even know the underlying storage engine have changed. The default storage engine is InnoDB - a B+ tree based database storage engine, and the one that we have is MyRocks which is built on top of RocksDB, a LSM-tree based database storage engine. There is an API layer called handler that storage engine need to implement/override. You can go to [Comparison of MySQL database engines](https://en.wikipedia.org/wiki/Comparison_of_MySQL_database_engines) to see a list of common storage engines in MySQL.

> Of course, the statement that they wouldn't know the storage engine has changed is not entirely accurate. There are specific configurations you might need to tune / config the storage engine to your needs, and different storage engine has different performance / behavior / features / capabilities, so it's not completely transparent.

## Building 

You can obtain source code from MySQL website, but most folks probably would prefer a github mirror:

```
git clone https://github.com/mysql/mysql-server
```

This contains the latest MySQL 8.0.16. 

In a typical Ubuntu system, you need to install following dependencies:

```
sudo apt install libssl-dev libzstd-dev libncurses5-dev libreadline-dev bison pkg-config
```

> All my instructions below are tested on a Azure Linux Ubuntu 18.04 VM and on a MacBook Pro 2018. They may vary slightly due to your configuration/distribution if you are on a unix/linux system. Getting it to work on Windows wasn't too bad either, if I remember correctly.

Now let's create a `debug` directory to store all our build files, and start the debug build:

```
mkdir debug
cd debug
cmake .. -DWITH_DEBUG=1 -DDOWNLOAD_BOOST=1 -DWITH_BOOST=~/boost_1_69_0
make
```

1. `WITH_DEBUG=1` requests a debug build, which makes debugger easier
2. `DOWNLOAD_BOOST=1` `WITH_BOOST=~/boost_1_69_0` downloads the boost at ~/boost_1_69_0 (that's the version MySQL is asking for), and will skip the downloading if it is already there

One the build is done, you can find everything under `debug/bin`.

> Don't change the build directory after the fact once you done the build. The directory name is remembered and changing that naming requires a rebuild.

## Running a test 

To validate that we indeed have a working MySQL build, let's try running a quick test called `select_all`. 

To run any test, there is a script `mysql-test-run.pl` located under the mysql-test directory from the build directory, and it takes a test name in the form of `<testname>` or `<testsuite>.<testname>`:

```
cd debug/mysql-test
./mysql-test-run.pl select_all
```

This runs the test under `mysql-test/t/select_all.test` with baseline `mysql-test/r/select_all.result`. It runs a simple test language containing test directives/commands and SQL commands, and compare the output with the baseline. If the output diverges from the baseline the test would fail, otherwise it would pass. Simple enough, right? 

> Actually, not quite. The testing of MySQL can get quite complicated when it involves multiple connections / servers communicating with each other. And stablizing the results so that they are not affected by external environment / code changes can be also an headache.

Here is what you should see:

```
[~/local/github/mysql-server/debug/mysql-test, 8.0, 51s, SUDO]: ./mysql-test-run.pl select_all 
Logging: /home/yzha/local/github/mysql-server/mysql-test/mysql-test-run.pl  select_all       
MySQL Version 8.0.16                                                                         
Checking supported features                                                                  
 - Binaries are debug compiled                                                               
Using 'all' suites                                                                           
Collecting tests                                                                             
Checking leftover processes                                                                  
Removing old var directory                                                                   
Creating var directory '/home/yzha/local/github/mysql-server/debug/mysql-test/var'             
Installing system database                                                                   
Using parallel: 1                                                                            
                                                                                             
==============================================================================               
                  TEST NAME                       RESULT  TIME (ms) COMMENT                  
------------------------------------------------------------------------------               
[100%] main.select_all                           [ pass ]  36259                             
------------------------------------------------------------------------------               
The servers were restarted 0 times                                                           
The servers were reinitialized 0 times                                                       
Spent 36.259 of 70 seconds executing testcases                                               
```

## Launching and connecting

Running a test seems straight-forward enough. If you want to launch mysql server and run some SQL commands against it, it takes a bit of work.

First we need to have mysqld initializes a blank data directory:

```
cd debug/bin
./mysqld --initialize
```

You should see:

```
2019-06-05T05:16:31.376510Z 0 [System] [MY-013169] [Server] /datadrive/github/mysql-server/debug/runtime_output_directory/mysqld (mysqld 8.0.16-debug) initializing of server in progress as process 70030
2019-06-05T05:16:44.066787Z 5 [Note] [MY-010454] [Server] A temporary password is generated for root@localhost: <.....>
2019-06-05T05:16:53.317610Z 0 [System] [MY-013170] [Server] /datadrive/github/mysql-server/debug/runtime_output_directory/mysqld (mysqld 8.0.16-debug) initializing of server has completed
```

Note the temporary password generated in the second line. You'll need it later.

This means that mysqld has successfully initialized at debug/data directory:

```
'#innodb_temp'   auto.cnf   ca-key.pem   ca.pem   client-cert.pem   client-key.pem   ib_buffer_pool   ib_logfile0   ib_logfile1   ibdata1   mysql   mysql.ibd   performance_schema   private_key.pem   public_key.pem   server-cert.pem   server-key.pem   sys   undo_001   undo_002
```

Now we can finally start the server:

```
cd debug/bin
./mysqld --debug
```

`--debug` switch means we start the mysql server in debug mode.

Now launch another terminal / TMUX window / whatever, and connect to the mysql server:

```
cd debug/bin
./mysql -uroot --socket=/tmp/mysql.sock -p
```

You should see:

```
Enter password: 
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 28
Server version: 8.0.16-debug Source distribution

Copyright (c) 2000, 2019, Oracle and/or its affiliates. All rights reserved.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.
```

However we are not quite done yet. Mysql will ask us to change the password - you can do it by using the following:

```
mysql> ALTER USER 'root'@'localhost' IDENTIFIED BY "<newpassword>";
```

Now any future login can be done using this new password you just gave.

Finally we can run some SQL command!

```
mysql> SELECT @@version;
+--------------+
| @@version    |
+--------------+
| 8.0.16-debug |
+--------------+
1 row in set (0.00 sec)
```

Before I leave, let me address a question that is absolutely going to be asked - how do I terminate the server gracefully? CTRL+C doesn't work anymore.

The right way is to use mysqladmin:

```
cd debug/bin
./mysqladmin -uroot -p shutdown
```

You'll see the server waving goodbye:

```
2019-06-05T05:54:09.028071Z 30 [System] [MY-013172] [Server] Received SHUTDOWN from user root. Shutting down mysqld (Version: 8.0.16-debug).
2019-06-05T05:54:10.670124Z 0 [System] [MY-010910] [Server] /datadrive/github/mysql-server/debug/runtime_output_directory/mysqld: Shutdown complete (mysqld 8.0.16-debug)  Source distribution
```

## What's next

I'm planning a series of articles that will go through many interesting aspects of MySQL:

1. A quick tour of the source code and important concepts in MySQL source
2. How is the parsing and AST tree generation done for complex statements
3. How are statement being executed in MySQL
4. How to add your own command
5. How does MySQL optimizer / query execution work
6. How does plugin / storage engine work
7. How does system variables work
8. How does replication work 
9. How does SHOW command work
10. How does binlog work

I'm also planning to write about MyRocks, as well as RocksDB / LevelDB / InnoDB, but I'll priorize MySQL articles first as they lay down a nice foundation for rest of the stuff and this also serves as documentation when people get lost in the vast amount of MySQL source code. 

Let me know what do you think about the article and/or if you are running into issues. Feel free to suggest topics as well. But I probably can't help much with your DBA questions...
