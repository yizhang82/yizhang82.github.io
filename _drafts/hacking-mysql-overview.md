
## MySQL Overview

MySQL is one of the most widely used OpenSource relational databases and is used by many companies such as Amazon, Facebook, Google, Alibaba, etc. In my latest job (at time of the writing) we deploy MySQL widely within the Company, we had our MySQL 5.6 [own fork](https://github.com/facebook/mysql-5.6) and moving towards MySQL 8.0 currently in a [branch](https://github.com/facebook/mysql-5.6/tree/fb-mysql-8.0.13). We also have an "new" storage engine built on top of RocksDB, not surprisingly called [MyRocks](http://myrocks.io/), which lives under [storage/rocksdb](https://github.com/facebook/mysql-5.6/tree/fb-mysql-5.6.35/storage/rocksdb) folder in the MySQL 5.6 fork. 

On a 10000-feet view, the architecture of MySQL server looks like this:

1. Connection Management / Authentication
2. Table Management/Caching
3. SQL Parser
4. SQL Optimizer and Query Executioner
5. Execution Engine

One of the most amazing features in MySQL is to swap the underlying storage engine while keeping the same upper layers - this way you can have different in-memory and on-disk representation of databases for different workloads, while keeping the same SQL execution functionality so the client wouldn't even know the underlying storage engine have changed. The default storage engine is InnoDB - a B+ tree based database storage engine, and the one that we have is MyRocks which is built on top of RocksDB, a LSM-tree based database storage engine. There is an API layer called handler that storage engine need to implement/override.

> Of course, the statement that they wouldn't know the storage engine has changed is not entirely accurate. There are specific configurations you might need to tune / config the storage engine to your needs, and different storage engine has different performance / behavior, so it's not completely transparent.

## Building 

In a typical Ubuntu system, you need to install following dependencies:

```
sudo apt install libssl-dev libzstd-dev libncurses5-dev libreadline-dev bison pkg-config
```

## Giving it a spin

## Important Concepts



## Tour of Source

Here are a list of the most interesting directories:

* `cmake` - cmake files for building MySQL
* `client` - where the client tooling lives, such as mysql, mysqlbinlog, mysqladmin, etc. 
* `storage`
  * `innobase` -
  * `csv` -
  * `heap` -
  * `ndb`
  * `archive`
  * `blackhole`
  * `myisam` - 
  * `example` - 

* `sql`
  * `mysqld.cc` - the main entry point
  * `handler.*`
  * `item*.*`
  * `field.*` - MySQL table field class
  * `key.*` - key comparison utilities
  * `table.*` - defines `TABLE`/`TABLE_SHARE`/`TABLE_LIST`
  * `sql_class.*` - defines `THD`
  * `lex.*`, `sql_lex*.*` 
  * `sql_yacc.yy` - 
  *  `sql_parse.*` - the main entry point for executing SQL commands
  * `sql_show.*` - implements SHOW command
  * `sql_select.*`, `sql_optimizer.*`, `opt_*.*` - implements SELECT command including query optimization and execution
  * `structs.h` - important struct definition like `KEY`, `KEY_PART_INFO`, as well as various stats
  * `set_var.*`, `sys_var.*` - system variables support
  * `sql_plugin*.*` - MySQL plugin and plugin variable infra 
* `mysql-test` - all tests live here
* `vio` - networking (sockets and SSL)

