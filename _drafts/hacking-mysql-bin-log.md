---
layout: post
title:  ""
description: 
permalink: hacking-mysql-1 
comments: true
excerpt_separator: <!--more-->
categories:
- mysql 
- database
- source 
---


[MySQL Binlog](https://dev.mysql.com/doc/refman/8.0/en/binary-log.html) contains events that describes database transactional operations, including DDL (changing definition/metadata) and DML (changing data) operations. It is used for replicating operations to other slaves, as well as data recovery in cases like restoring from a backup. 


purge_index_file : binlog.~rec~

```
  Format_description_log_event s;

  if (m_binlog_file->is_empty()) {
    /*
      The binary log file was empty (probably newly created)
      This is the normal case and happens when the user doesn't specify
      an extension for the binary log files.
      In this case we write a standard header to it.
    */
    if (m_binlog_file->write((uchar *)BINLOG_MAGIC, BIN_LOG_HEADER_SIZE))
      goto err;
    bytes_written += BIN_LOG_HEADER_SIZE;
    write_file_name_to_index_file = 1;
  }
```

BINLOG_MAGIC

```
#define BINLOG_MAGIC "\xfe\x62\x69\x6e"
#define BINLOG_MAGIC_SIZE 
```


## write_event_to_binlog

```
#define LOG_EVENT_BINLOG_IN_USE_F 0x1
```

## binlog events

* [Common-header](https://dev.mysql.com/doc/dev/mysql-server/latest/classbinary__log_1_1Log__event__header.html#Table_common_header)
  * `when` - 4 byte unsigned integer
  * `type_code`
  * `unmasked_server_id`
  * `data_written`
  * `log_pos`
  * `flags`
* Post-header
* Body
* [Footer](https://dev.mysql.com/doc/dev/mysql-server/latest/classbinary__log_1_1Log__event__footer.html#Table_common_footer) - common to all MySQL binlog 
  * `checksum_alg`  

## Binary_log_event 

* Append_block_event - generated for LOAD_DATA_INFILE containing the raw data of the file being loaded. May have multiple instances of this event if the file size is larger than threshold. 
* Delete_file_event - generated when LOAD_DATA failed on the master and tells the slave to delete the file.
* Format_description_event
* Gtid_event
* Heartbeat_event
* Ignorable_event
* Incident_event
* Intvar_event
* Previous_gtids_event
* Query_event
* Rows_event
* Stop_event
* Table_map_event
* Transaction_context_event
* Unknown_event
* User_var_event
* View_change_event
* XA_prepare_event
* Xid_event

## Log_event

## Flushing the log

```
int binlog_cache_data::flush(THD *thd, my_off_t *bytes_written,
                             bool *wrote_xid) {
  /*
    Doing a commit or a rollback including non-transactional tables,
    i.e., ending a transaction where we might write the transaction
    cache to the binary log.

    We can always end the statement when ending a transaction since
    transactions are not allowed inside stored functions. If they
    were, we would have to ensure that we're not ending a statement
    inside a stored function.
  */
  DBUG_ENTER("binlog_cache_data::flush");
  DBUG_PRINT("debug", ("flags.finalized: %s", YESNO(flags.finalized)));
  int error = 0;
  if (flags.finalized) {
    my_off_t bytes_in_cache = m_cache.length();
    Transaction_ctx *trn_ctx = thd->get_transaction();

    DBUG_PRINT("debug", ("bytes_in_cache: %llu", bytes_in_cache));

    trn_ctx->sequence_number = mysql_bin_log.m_dependency_tracker.step();

    /*
      In case of two caches the transaction is split into two groups.
      The 2nd group is considered to be a successor of the 1st rather
      than to have a common commit parent with it.
      Notice that due to a simple method of detection that the current is
      the 2nd cache being flushed, the very first few transactions may be logged
      sequentially (a next one is tagged as if a preceding one is its
      commit parent).
    */
    if (trn_ctx->last_committed == SEQ_UNINIT)
      trn_ctx->last_committed = trn_ctx->sequence_number - 1;

    /*
      The GTID is written prior to flushing the statement cache, if
      the transaction has written to the statement cache; and prior to
      flushing the transaction cache if the transaction has written to
      the transaction cache.  If GTIDs are enabled, then transactional
      and non-transactional updates cannot be mixed, so at most one of
      the caches can be non-empty, so just one GTID will be
      generated. If GTIDs are disabled, then no GTID is generated at
      all; if both the transactional cache and the statement cache are
      non-empty then we get two Anonymous_gtid_log_events, which is
      correct.
    */
    Binlog_event_writer writer(mysql_bin_log.get_binlog_file());

    /* The GTID ownership process might set the commit_error */
    error = (thd->commit_error == THD::CE_FLUSH_ERROR);

    DBUG_EXECUTE_IF("simulate_binlog_flush_error", {
      if (rand() % 3 == 0) {
        thd->commit_error = THD::CE_FLUSH_ERROR;
      }
    };);

    if (!error)
      if ((error = mysql_bin_log.write_gtid(thd, this, &writer)))
        thd->commit_error = THD::CE_FLUSH_ERROR;
    if (!error) error = mysql_bin_log.write_cache(thd, this, &writer);

    if (flags.with_xid && error == 0) *wrote_xid = true;

    /*
      Reset have to be after the if above, since it clears the
      with_xid flag
    */
    reset();
    if (bytes_written) *bytes_written = bytes_in_cache;
  }
  DBUG_ASSERT(!flags.finalized);
  DBUG_RETURN(error);
}
```

```
  * frame #0: 0x0000000101ec4dd3 mysqld`MYSQL_BIN_LOG::write_event(this=0x00000001048df780, event_info=0x000070000979df08) at binlog.cc:6814
    frame #1: 0x0000000101edeee3 mysqld`THD::binlog_query(this=0x000000012436de00, qtype=STMT_QUERY_TYPE, query_arg="create table t1 (pk int primary key, a int)", query_len=43, is_trans=true, direct=false, suppress_use=false, errcode=0) at binlog.cc:11272
    frame #2: 0x0000000100ab3647 mysqld`write_bin_log(thd=0x000000012436de00, clear_error=true, query="create table t1 (pk int primary key, a int)", query_length=43, is_trans=true) at sql_table.cc:1081
    frame #3: 0x0000000100ad99a3 mysqld`mysql_create_table(thd=0x000000012436de00, create_table=0x000000010a833c68, create_info=0x000070000979f630, alter_info=0x000070000979f4e0) at sql_table.cc:9294
    frame #4: 0x00000001008c72bb mysqld`Sql_cmd_create_table::execute(this=0x000000010a834550, thd=0x000000012436de00) at sql_cmd_ddl_table.cc:319
    frame #5: 0x00000001009ce552 mysqld`mysql_execute_command(thd=0x000000012436de00, first_level=true) at sql_parse.cc:3413
    frame #6: 0x00000001009c8be5 mysqld`mysql_parse(thd=0x000000012436de00, parser_state=0x00007000097a3870) at sql_parse.cc:5194
    frame #7: 0x00000001009c5246 mysqld`dispatch_command(thd=0x000000012436de00, com_data=0x00007000097a4d78, command=COM_QUERY) at sql_parse.cc:1746
    frame #8: 0x00000001009c7aa7 mysqld`do_command(thd=0x000000012436de00) at sql_parse.cc:1264
    frame #9: 0x0000000100c88e48 mysqld`handle_connection(arg=0x000000010c16b410) at connection_handler_per_thread.cc:302
    frame #10: 0x0000000102fd6075 mysqld`pfs_spawn_thread(arg=0x0000000127c1b430) at pfs.cc:2836
    frame #11: 0x00007fff7cac42eb libsystem_pthread.dylib`_pthread_body + 126
    frame #12: 0x00007fff7cac7249 libsystem_pthread.dylib`_pthread_start + 66
    frame #13: 0x00007fff7cac340d libsystem_pthread.dylib`thread_start + 13
```

```
* thread #40, stop reason = breakpoint 3.1
  * frame #0: 0x0000000101ebea38 mysqld`binlog_cache_data::flush(this=0x0000000127a68200, thd=0x000000012436de00, bytes_written=0x000070000979d370, wrote_xid=0x000070000979d3cf) at binlog.cc:1855
    frame #1: 0x0000000101ee32f3 mysqld`binlog_cache_mngr::flush(this=0x0000000127a68200, thd=0x000000012436de00, bytes_written=0x000070000979d3d0, wrote_xid=0x000070000979d3cf) at binlog.cc:1076
    frame #2: 0x0000000101ee30ed mysqld`MYSQL_BIN_LOG::flush_thread_caches(this=0x00000001048df780, thd=0x000000012436de00) at binlog.cc:8112
    frame #3: 0x0000000101ee3557 mysqld`MYSQL_BIN_LOG::process_flush_stage_queue(this=0x00000001048df780, total_bytes_var=0x000070000979d690, rotate_var=0x000070000979d68f, out_queue_var=0x000070000979d670) at binlog.cc:8171
    frame #4: 0x0000000101ec2ac5 mysqld`MYSQL_BIN_LOG::ordered_commit(this=0x00000001048df780, thd=0x000000012436de00, all=true, skip_commit=false) at binlog.cc:8743
    frame #5: 0x0000000101eb8202 mysqld`MYSQL_BIN_LOG::commit(this=0x00000001048df780, thd=0x000000012436de00, all=true) at binlog.cc:8070
    frame #6: 0x00000001002f5f5a mysqld`ha_commit_trans(thd=0x000000012436de00, all=true, ignore_global_read_lock=false) at handler.cc:1697
    frame #7: 0x0000000100c05888 mysqld`trans_commit_implicit(thd=0x000000012436de00, ignore_global_read_lock=false) at transaction.cc:342
    frame #8: 0x0000000100ada144 mysqld`mysql_create_table(thd=0x000000012436de00, create_table=0x000000010a833c68, create_info=0x000070000979f630, alter_info=0x000070000979f4e0) at sql_table.cc:9345
    frame #9: 0x00000001008c72bb mysqld`Sql_cmd_create_table::execute(this=0x000000010a834550, thd=0x000000012436de00) at sql_cmd_ddl_table.cc:319
    frame #10: 0x00000001009ce552 mysqld`mysql_execute_command(thd=0x000000012436de00, first_level=true) at sql_parse.cc:3413
    frame #11: 0x00000001009c8be5 mysqld`mysql_parse(thd=0x000000012436de00, parser_state=0x00007000097a3870) at sql_parse.cc:5194
    frame #12: 0x00000001009c5246 mysqld`dispatch_command(thd=0x000000012436de00, com_data=0x00007000097a4d78, command=COM_QUERY) at sql_parse.cc:1746
    frame #13: 0x00000001009c7aa7 mysqld`do_command(thd=0x000000012436de00) at sql_parse.cc:1264
    frame #14: 0x0000000100c88e48 mysqld`handle_connection(arg=0x000000010c16b410) at connection_handler_per_thread.cc:302
    frame #15: 0x0000000102fd6075 mysqld`pfs_spawn_thread(arg=0x0000000127c1b430) at pfs.cc:2836
    frame #16: 0x00007fff7cac42eb libsystem_pthread.dylib`_pthread_body + 126
    frame #17: 0x00007fff7cac7249 libsystem_pthread.dylib`_pthread_start + 66
    frame #18: 0x00007fff7cac340d libsystem_pthread.dylib`thread_start + 13
```
