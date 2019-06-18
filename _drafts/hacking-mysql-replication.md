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
Rpl_info_factory::create_slave_info_objects
```