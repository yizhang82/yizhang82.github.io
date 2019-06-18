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
