
## Important Concepts

* THD
* TABLE
* TABLE_SHARE
* TABLE_LIST
* Item
* Field
* Handler
* Handlerton

## Tour of Source

Here are a list of the most interesting directories:

* `cmake` - cmake files for building MySQL
* `client` - where the client tooling lives, such as mysql, mysqlbinlog, mysqladmin, etc. 
* `storage`
  * `innobase` - This is the default storage engine InnoDB supporting transactions and row-level locking. It is the most feature complete.
  * `csv` - Operates on CSV files and doesn't support index
  * `heap` - In memory only database supporting quick lookup of non-critical data. Not that interesting anymore.
  * `ndb`
  * `archive` - Simple storage engine for archive purposes where everything is compressed. A good next step for understanding storage engines once you looked at example.
  * `blackhole` - equivalent of /dev/null
  * `myisam` - Legacy storage engine for MySQL superceded by InnoDB. It only suppports table-level locking so its performance is rather limited in high concurrency situations.
  * `example` - An example storage engine. First thing you should look at if you want to understand storage engines. It doesn't really do much, though.
* `sql` - Most of critical MySQL infrastructure code lives here
  * `mysqld.cc` - the main entry point
  * `handler.*` - 
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

