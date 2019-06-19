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


```
    case SQLCOM_SLAVE_START: {
      res = start_slave_cmd(thd);
      break;
    }
    case SQLCOM_SLAVE_STOP: {
      /*
        If the client thread has locked tables, a deadlock is possible.
        Assume that
        - the client thread does LOCK TABLE t READ.
        - then the master updates t.
        - then the SQL slave thread wants to update t,
          so it waits for the client thread because t is locked by it.
        - then the client thread does SLAVE STOP.
          SLAVE STOP waits for the SQL slave thread to terminate its
          update t, which waits for the client thread because t is locked by it.
        To prevent that, refuse SLAVE STOP if the
        client thread has locked tables
      */
      if (thd->locked_tables_mode || thd->in_active_multi_stmt_transaction() ||
          thd->global_read_lock.is_acquired()) {
        my_error(ER_LOCK_OR_ACTIVE_TRANSACTION, MYF(0));
        goto error;
      }

      res = stop_slave_cmd(thd);
      break;
    }
 
```


```
bool start_slave(THD *thd) {
  DBUG_ENTER("start_slave(THD)");
  Master_info *mi;
  bool channel_configured, error = false;

  if (channel_map.get_num_instances() == 1) {
    mi = channel_map.get_default_channel_mi();
    DBUG_ASSERT(mi);
    if (start_slave(thd, &thd->lex->slave_connection, &thd->lex->mi,
                    thd->lex->slave_thd_opt, mi, true))
      DBUG_RETURN(true);
```


## ChannelMap and MasterInfo

```c++
class Multisource_info {
 private:
  /* Maximum number of channels per slave */
  static const unsigned int MAX_CHANNELS = 256;

  /* A Map that maps, a channel name to a Master_info grouped by channel type */
  replication_channel_map rep_channel_map;

  /* Number of master_infos at the moment*/
  uint current_mi_count;
```

```c++
// Maps a master info object to a channel name
typedef std::map<std::string, Master_info *> mi_map;
// Maps a channel type to a map of channels of that type.
typedef std::map<int, mi_map> replication_channel_map;
```

```c++
bool Multisource_info::add_mi(const char *channel_name, Master_info *mi) {
  DBUG_ENTER("Multisource_info::add_mi");

  m_channel_map_lock->assert_some_wrlock();

  mi_map::const_iterator it;
  std::pair<mi_map::iterator, bool> ret;
  bool res = false;

  /* The check of mi exceeding MAX_CHANNELS shall be done in the caller */
  DBUG_ASSERT(current_mi_count < MAX_CHANNELS);

  replication_channel_map::iterator map_it;
  enum_channel_type type = is_group_replication_channel_name(channel_name)
                               ? GROUP_REPLICATION_CHANNEL
                               : SLAVE_REPLICATION_CHANNEL;

  map_it = rep_channel_map.find(type);

  if (map_it == rep_channel_map.end()) {
    std::pair<replication_channel_map::iterator, bool> map_ret =
        rep_channel_map.insert(
            replication_channel_map::value_type(type, mi_map()));

    if (!map_ret.second) DBUG_RETURN(true);

    map_it = rep_channel_map.find(type);
  }

  ret = map_it->second.insert(mi_map::value_type(channel_name, mi));
```


## Slave initialization

```
    /*
      init_slave() must be called after the thread keys are created.
    */
    if (server_id != 0)
      init_slave(); /* Ignoring errors while configuring replication. */
```



```
bool Rpl_info_factory::create_slave_info_objects(
    uint mi_option, uint rli_option, int thread_mask,
    Multisource_info *pchannel_map) {

```

```
  /*
    Initialize the repository metadata. This metadata is the
    name of files to look in case of FILE type repository, and the
    names of table to look in case of TABLE type repository.
  */
  Rpl_info_factory::init_repository_metadata();
```

```
  /* Count the number of Master_info and Relay_log_info repositories */
  if (scan_repositories(&mi_instances, &mi_repository, mi_table_data,
                        mi_file_data, &msg) ||
      scan_repositories(&rli_instances, &rli_repository, rli_table_data,
                        rli_file_data, &msg)) {
    /* msg will contain the reason of failure */
    LogErr(ERROR_LEVEL, ER_RPL_SLAVE_GENERIC_MESSAGE, msg);
    error = true;
    goto end;
  }
```

```c++
  /* Make a list of all channels if the slave was connected to previously*/
  if (load_channel_names_from_repository(channel_list, mi_instances,
                                         mi_repository,
                                         pchannel_map->get_default_channel(),
                                         &default_channel_existed_previously)) {
    LogErr(ERROR_LEVEL, ER_RPL_SLAVE_COULD_NOT_CREATE_CHANNEL_LIST);
    error = true;
    goto end;
  }
```

```c++
for (std::vector<std::string>::iterator it = channel_list.begin();
       it != channel_list.end(); ++it) {
    const char *cname = (*it).c_str();
    bool is_default_channel =
        !strcmp(cname, pchannel_map->get_default_channel());
    channel_error = !(mi = create_mi_and_rli_objects(
                          mi_option, rli_option, cname,
                          (channel_list.size() == 1) ? 1 : 0, pchannel_map));
    /*
      Read the channel configuration from the repository if the channel name
      was read from the repository.
    */
    if (!channel_error &&
        (!is_default_channel || default_channel_existed_previously)) {
      bool ignore_if_no_info = (channel_list.size() == 1) ? true : false;
      channel_error =
          load_mi_and_rli_from_repositories(mi, ignore_if_no_info, thread_mask);
    }

    if (!channel_error) {
      error = configure_channel_replication_filters(mi->rli, cname);
    } else {
      LogErr(ERROR_LEVEL, ER_RPL_SLAVE_FAILED_TO_INIT_A_MASTER_INFO_STRUCTURE,
             cname);
    }
    error = error || channel_error;
  }
```

Following code access `mysql.slave_master_info`.


```c++
bool Rpl_info_factory::load_channel_names_from_table(
    std::vector<std::string> &channel_list, const char *default_channel,
    bool *default_channel_existed_previously) {
  DBUG_ENTER(" Rpl_info_table::load_channel_names_from_table");

  int error = 1;
  TABLE *table = 0;
  ulong saved_mode;
  Open_tables_backup backup;
  Rpl_info_table *info = 0;
  THD *thd = 0;
  char buff[MAX_FIELD_WIDTH];
  *default_channel_existed_previously = false;
  String str(buff, sizeof(buff),
             system_charset_info);  // to extract channel names

  uint channel_field = Master_info::get_channel_field_num() - 1;

  if (!(info = new Rpl_info_table(mi_table_data.n_fields, mi_table_data.schema,
                                  mi_table_data.name, mi_table_data.n_pk_fields,
                                  mi_table_data.pk_field_indexes)))
    DBUG_RETURN(true);

  thd = info->access->create_thd();
  saved_mode = thd->variables.sql_mode;

  /*
     Opens and locks the rpl_info table before accessing it.
  */
  if (info->access->open_table(thd, info->str_schema, info->str_table,
                               info->get_number_info(), TL_READ, &table,
                               &backup)) {
    /*
      We cannot simply print out a warning message at this
      point because this may represent a bootstrap.
    */
    error = 0;
    goto err;
  }

  /* Do ha_handler random init for full scanning */
  if ((error = table->file->ha_rnd_init(true))) DBUG_RETURN(true);

  /* Ensure that the table pk (Channel_name) is at the correct position */
  if (info->verify_table_primary_key_fields(table)) {
    LogErr(ERROR_LEVEL, ER_RPL_SLAVE_FAILED_TO_CREATE_CHANNEL_FROM_MASTER_INFO);
    error = -1;
    goto err;
  }

  /*
    Load all the values in record[0] for each row
    and then extract channel name from it
  */

  do {
    error = table->file->ha_rnd_next(table->record[0]);
    switch (error) {
      case 0:
        /* extract the channel name from table->field and append to the list */
        table->field[channel_field]->val_str(&str);
        channel_list.push_back(std::string(str.c_ptr_safe()));
        if (!strcmp(str.c_ptr_safe(), default_channel))
          *default_channel_existed_previously = true;
        break;

      case HA_ERR_END_OF_FILE:
        break;

      default:
        DBUG_PRINT("info", ("Failed to get next record"
                            " (ha_rnd_next returns %d)",
                            error));
    }
  } while (!error);

  /*close the table */
err:

  table->file->ha_rnd_end();
  info->access->close_table(thd, table, &backup, error);
  thd->variables.sql_mode = saved_mode;
  info->access->drop_thd(thd);
  delete info;
  DBUG_RETURN(error != HA_ERR_END_OF_FILE && error != 0);
}
```

```c++
/*
  Defines meta information on diferent repositories.
*/
Rpl_info_factory::struct_table_data Rpl_info_factory::rli_table_data;
Rpl_info_factory::struct_file_data Rpl_info_factory::rli_file_data;
Rpl_info_factory::struct_table_data Rpl_info_factory::mi_table_data;
Rpl_info_factory::struct_file_data Rpl_info_factory::mi_file_data;
Rpl_info_factory::struct_file_data Rpl_info_factory::worker_file_data;
Rpl_info_factory::struct_table_data Rpl_info_factory::worker_table_data;
```

## Master_info / Relay_log_info

Master_info represents the I/O thread:

Relay_log_info representes the SQL thread:

## Starting

```
    for (mi_map::iterator it = channel_map.begin(); it != channel_map.end();
         it++) {
      mi = it->second;

      /* If server id is not set, start_slave_thread() will say it */
      if (Master_info::is_configured(mi) && mi->rli->inited) {
        /* same as in start_slave() cache the global var values into rli's
         * members */
        mi->rli->opt_slave_parallel_workers = opt_mts_slave_parallel_workers;
        mi->rli->checkpoint_group = opt_mts_checkpoint_group;
        if (mts_parallel_option == MTS_PARALLEL_TYPE_DB_NAME)
          mi->rli->channel_mts_submode = MTS_PARALLEL_TYPE_DB_NAME;
        else
          mi->rli->channel_mts_submode = MTS_PARALLEL_TYPE_LOGICAL_CLOCK;
        if (start_slave_threads(true /*need_lock_slave=true*/,
                                false /*wait_for_start=false*/, mi,
                                thread_mask)) {
          LogErr(ERROR_LEVEL, ER_FAILED_TO_START_SLAVE_THREAD,
                 mi->get_channel());
        }
      } else {
        LogErr(INFORMATION_LEVEL, ER_FAILED_TO_START_SLAVE_THREAD,
               mi->get_channel());
      }
    }
 ```


```
bool start_slave_threads(bool need_lock_slave, bool wait_for_start,
                         Master_info *mi, int thread_mask) {
    is_error = start_slave_thread(
#ifdef HAVE_PSI_THREAD_INTERFACE
        key_thread_slave_io,
#endif
        handle_slave_io, lock_io, lock_cond_io, cond_io, &mi->slave_running,
        &mi->slave_run_id, mi);
 
    /* ... */

    is_error = start_slave_thread(
#ifdef HAVE_PSI_THREAD_INTERFACE
          key_thread_slave_sql,
#endif
          handle_slave_sql, lock_sql, lock_cond_sql, cond_sql,
          &mi->rli->slave_running, &mi->rli->slave_run_id, mi);

```


## handle_slave_io

```c++
  THD_STAGE_INFO(thd, stage_connecting_to_master);
  successfully_connected = !safe_connect(thd, mysql, mi);

  /* ... */

  THD_STAGE_INFO(thd, stage_checking_master_version);
  ret = get_master_version_and_clock(mysql, mi);
  if (!ret) ret = get_master_uuid(mysql, mi);
  if (!ret) ret = io_thread_init_commands(mysql, mi);

  /* ... */

  THD_STAGE_INFO(thd, stage_registering_slave_on_master);
  register_slave_on_master(mysql, mi, &suppress_warnings);

  /* ... */

  while (!io_slave_killed(thd, mi)) {
    MYSQL_RPL rpl;

    THD_STAGE_INFO(thd, stage_requesting_binlog_dump);
    request_dump(thd, mysql, &rpl, mi, &suppress_warnings);

    while (!io_slave_killed(thd, mi)) {
      THD_STAGE_INFO(thd, stage_waiting_for_master_to_send_event);
      event_len = read_event(mysql, &rpl, mi, &suppress_warnings);

      QUEUE_EVENT_RESULT queue_res = queue_event(mi, event_buf, event_len);
```

 
```c++
QUEUE_EVENT_RESULT queue_event(Master_info *mi, const char *buf,
                               ulong event_len, bool do_flush_mi) {

  Log_event_type event_type = (Log_event_type)buf[EVENT_TYPE_OFFSET];
  switch (event_type) {
    case binary_log::STOP_EVENT:
    case binary_log::ROTATE_EVENT:
    case binary_log::FORMAT_DESCRIPTION_EVENT:
    case binary_log::HEARTBEAT_LOG_EVENT:
    case binary_log::PREVIOUS_GTIDS_LOG_EVENT: 
    case binary_log::GTID_LOG_EVENT: 
    case binary_log::ANONYMOUS_GTID_LOG_EVENT:
    /* fall through */
    default:
      inc_pos = event_len;
      break;

    rli->relay_log.write_buffer(buf, event_len, mi);
    mi->set_master_log_pos(mi->get_master_log_pos() + inc_pos);
```


## handle_slave_sql


```
  while (!sql_slave_killed(thd, rli)) {
    THD_STAGE_INFO(thd, stage_reading_event_from_the_relay_log);
    DBUG_ASSERT(rli->info_thd == thd);
    THD_CHECK_SENTRY(thd);

    if (saved_skip && rli->slave_skip_counter == 0) {
      LogErr(INFORMATION_LEVEL, ER_RPL_SLAVE_SKIP_COUNTER_EXECUTED,
             (ulong)saved_skip, saved_log_name, (ulong)saved_log_pos,
             saved_master_log_name, (ulong)saved_master_log_pos,
             rli->get_group_relay_log_name(),
             (ulong)rli->get_group_relay_log_pos(),
             rli->get_group_master_log_name(),
             (ulong)rli->get_group_master_log_pos());
      saved_skip = 0;
    }

    if (exec_relay_log_event(thd, rli, &applier_reader)) {
      DBUG_PRINT("info", ("exec_relay_log_event() failed"));
```

