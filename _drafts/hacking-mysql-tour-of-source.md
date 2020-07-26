
## Important Concepts

### THD

For each connection MySQL will either create or reuse an OS thread. The THD structure represents the logical MySQL connection associated with that particular thread.

Typically, within MySQL code when accessing data that are connection specific, you don't need to worry about race condition, because connections by definition are isolated from each other, unless you are accessing shared data. Many fields in THD are connection specific and therefore are usually safe to access within that connection, and there are also data that can be accessed from other threads and therefore protected by `lock_THD_data`.

The class is quite large (typical for MySQL internal data structure types existing from the early days) as it gets overloaded with a lot of connection specific states and becoming a dump ground of sorts. The class looks something like this (much simplified):

```c++
/**
  @class THD
  For each client connection we create a separate thread with THD serving as
  a thread/connection descriptor
*/

class THD : public MDL_context_owner,
            public Query_arena,
            public Open_tables_state {
  std::unique_ptr<LEX> main_lex;
  LEX_CSTRING m_query_string;
  LEX_CSTRING m_db;
  mysql_mutex_t LOCK_thd_data;
```

### TABLE and TABLE_SHARE

For each MySQL table, you would only have at most one `TABLE_SHARE` object - it is the *definition* of the table and has information on the table that doesn't have states and are immutable by DMLs (until the next DDL).

It contains information such as list of fields/keys, comment of the table, etc. Pretty much most of what's in the DDL or what you see in create table is from `TABLE_SHARE` or can be obtained from `TABLES_SHARE`.

```c++
/**
  This structure is shared between different table objects. There is one
  instance of table share per one table in the database.
*/

struct TABLE_SHARE {
  Field **field{nullptr};
  LEX_STRING comment{nullptr, 0};      /* Comment about table */
  KEY *key_info{nullptr};    /* data of keys defined for the table */
```

On the other hand, you could have multiple `TABLE` object opened from multiple connections as they are instances of the same `TABLE_SHARE` object and carry instance-specific states that usually tied to the current query. If you are familiar with object oritended languages, this `TABLE_SHARE` would be a `type` where `TABLE` would be object instance that you _new_ from.

```c++
/*
  NOTE: Despite being a struct (for historical reasons), TABLE has
  a nontrivial destructor.
*/
struct TABLE {
  TABLE_SHARE *s{nullptr};
  handler *file{nullptr};
  TABLE *next{nullptr}, *prev{nullptr}

  THD *in_use{nullptr};   /* Which thread uses this */
  Field **field{nullptr}; /* Pointer to fields */
  uchar *record[2]{nullptr, nullptr}; /* Pointer to records */
```

### KEY, KEY_PART, and Field

In `TABLE_SHARE`, `key_info` pointer is pointing to a list of indexes for the table, represented by `KEY`. Each `KEY` knows the list of `KEY_PART_INFO`: 

```c++
class KEY {
 public:
  /** Tot length of key */
  uint key_length;
  /** dupp key and pack flags */
  ulong flags;
  /** dupp key and pack flags for actual key parts */
  ulong actual_flags;
  /** How many key_parts */
  uint user_defined_key_parts;
  /** How many key_parts including hidden parts */
  uint actual_key_parts;
```

A key part is basically the key column (`Field`), the offset within a record buffer (a row within a table) and a bunch of flags:

```c++
class KEY_PART_INFO { /* Info about a key part */
 public:
  Field *field;
  uint offset;      /* offset in record (from 0) */
  uint null_offset; /* Offset to null_bit in record */
  /* Length of key part in bytes, excluding NULL flag and length bytes */
  uint16 length;
```

We'll talk about the format of record buffer in another article. For now, just think it is a representation of row with fixed size, and the key part simply points to the fixed offset within the record, making it easier to read/write to the row.

For each `KEY_PART`, it knows its corresponding column, which is a `Field` type. The `Field` type contains some back pointers into the `TABLE`, its column index, and which keys have this field:

```c++
class Field {
 public:
  TABLE *table;             // Pointer for table
  const TABLE *orig_table;  // Pointer to original table
  const char **table_name, *field_name
  /* Field is part of the following keys */
  Key_map key_start;          /* Keys that starts with this field */
  Key_map part_of_key;        ///< Keys that includes this field
                              ///< except of prefix keys.
  Key_map part_of_prefixkey;  ///< Prefix keys
  Key_map part_of_sortkey;    /* ^ but only keys usable for sorting */
  uint32 flags;
  uint16 field_index;  // field number in fields array
```

### Handler and Handlerton

In MySQL, one of the most interesting feature is the separation of SQL layer and storage engine layer. The SQL layer is responsible for parsing query, optimizing the query, and executing the query with the help of storage engine with a set of primitives. The storage engine is responsible for storing the data physically on disk (or whatever medium you desire) and retrieve the data with those primitives.

`handlerton` is the type that is responsible for global operations for the storage engine that is independent of tables, such as open/closing connections, commiting/rolling back transactions, recovery, creating tables, etc. All these are function pointers.

```c++
/**
  handlerton is a singleton structure - one instance per storage engine -
  to provide access to storage engine functionality that works on the
  "global" level (unlike handler class that works on a per-table basis).

  usually handlerton instance is defined statically in ha_xxx.cc as

  static handlerton { ... } xxx_hton;

  savepoint_*, prepare, recover, and *_by_xid pointers can be 0.
*/
struct handlerton {
  close_connection_t close_connection;
  kill_connection_t kill_connection;
  pre_dd_shutdown_t pre_dd_shutdown;
  commit_t commit;
  rollback_t rollback;
  prepare_t prepare;
  recover_t recover;
  commit_by_xid_t commit_by_xid;
  rollback_by_xid_t rollback_by_xid;
  create_t create;
  drop_database_t drop_database;
  /* ... */
```

On the other hand, `handler` is a instance of storage engine that is specific to a particular `TABLE` and `THD`, therefore tied to a MySQL connection and table. It contains a lot of states about the current query that it is currently working on, as well as lots of storage engine functions for query execution that eventually calls into (often) abstract virtual functions that storage engine will need to execute:

```c++
class handler { 
 protected:
  TABLE_SHARE *table_share;       /* The table definition */
  TABLE *table;                   /* The current open table */
  uint active_index;
 
  int ha_rnd_init(bool scan);
  int ha_rnd_end();
  int ha_rnd_next(uchar *buf)

  virtual int rnd_init(bool scan) = 0;
  virtual int rnd_end() { return 0; }  /// @see index_read_map().
  virtual int rnd_next(uchar *buf) = 0;
  /* ... */
```

As you can see above, ha_rnd_init/ha_rnd_end/ha_rnd_next functions are the ones that are used to do table scans, and the corresponding storage engine implementation shall be in rnd_init/rnd_end/rnd_next, respectively.

A typicaly storage engine would need to derive from `handler` and override its storage engine related virtuals:

```c++
/** The class defining a handle to an InnoDB table */
class ha_innobase : public handler {
 public:
  ha_innobase(handlerton *hton, TABLE_SHARE *table_arg);
  ~ha_innobase() override;

  int rnd_init(bool scan) override;

  int rnd_end() override;

  int rnd_next(uchar *buf) override;
```

Is the storage engine interface basically a K/V store interface? Not quite.

At the most basic level, it can be seen as a service that iterate through the underlying storage and return a list of rows/records based on the list of clumns (read set), as well as inserting/updating rows. However, the primitives in storage engine are often a bit more high level than that, often operates closer to SQL than K/V store. It has some basic components of SQL query such as table scan, index scan, range scan, etc, while leaving sufficient high-level planning to the upper optimizer such as choosing the best query plan, joining, optimizing conditions, executing complicated query, etc, and the lines can get a bit blurry at times. 

As a real example, [MyRocks](https://github.com/facebook/mysql-5.6/wiki) is a storage engine that is implemented on top of RocksDB, a K/V store, and it needs to bridge the gap between SQL primitives such as how to store TABLEs, indexes, columns in a K/V store, as well as implementing SQL query primitives.

We'll talk about when we dive into the topic of storage engines.

## Tour of Source

Here are a list of the most interesting directories:

* `cmake` - cmake files for building MySQL
* `client` - where the client tooling lives, such as mysql, mysqlbinlog, mysqladmin, etc. 
* `libbinlogevents` - binlog events definition and implementation
* `libmysql` - mysqlclient library for client API
* `storage`
  * `innobase` - This is the default storage engine InnoDB supporting transactions and row-level locking. It is the most feature complete.
  * `csv` - Operates on CSV files and doesn't support index
  * `heap` - In memory only database supporting quick lookup of non-critical data. Not that interesting anymore.
  * `ndb` - MySQL ndb cluster
  * `archive` - Simple storage engine for archive purposes where everything is compressed. A good next step for understanding storage engines once you looked at example.
  * `blackhole` - equivalent of /dev/null
  * `myisam` - Legacy storage engine for MySQL superceded by InnoDB. It only suppports table-level locking so its performance is rather limited in high concurrency situations.
  * `example` - An example storage engine. First thing you should look at if you want to understand storage engines. It doesn't really do much, though.
* `sql` - Most of critical MySQL infrastructure code lives here
  * `mysqld.cc` - the main entry point of MySQL process
  * `handler.*` - storage engine layer
  * `item*.*` - expression AST node items for operators, functions, and literals
  * `field.*` - MySQL table field class
  * `key.*` - key comparison utilities
  * `table.*` - defines `TABLE`/`TABLE_SHARE`/`TABLE_LIST`
  * `sql_class.*` - defines `THD`
  * `lex.*`, `sql_lex*.*` - MySQL lexer
  * `sql_yacc.yy` - MySQL yacc parser
  *  `sql_parse.*` - the main entry point for executing SQL commands
  * `sql_show.*` - implements SHOW command
  * `sql_select.*`, `sql_optimizer.*`, `opt_*.*`, `sql_planner.*` - implements SELECT command including query optimization and execution
  * `structs.h` - important struct definition like `KEY`, `KEY_PART_INFO`, as well as various stats
  * `set_var.*`, `sys_var.*` - system variables support
  * `sql_plugin*.*` - MySQL plugin and plugin variable infra 
* `mysql-test` - all tests live here
* `my_sys` - MySQL's OS abstraction layer, 
* `vio` - networking (sockets and SSL)

