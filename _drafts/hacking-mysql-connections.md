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



create_thread_to_handle_connectio

handle_connections_sockets


void create_thread_to_handle_connection(THD *thd)
{
  mysql_mutex_lock(&LOCK_thread_count);
  if (blocked_pthread_count >  wake_pthread)
  {
    /* Wake up blocked pthread */
    DBUG_PRINT("info", ("waiting_thd_list->push %p", thd));
    waiting_thd_list->push_back(thd);
    wake_pthread++;
    mysql_cond_signal(&COND_thread_cache);



add_global_thread



block_until_new_connection_halflock


acl_authenticate

server_mpvio_initialize(


struct MPVIO_EXT :public MYSQL_PLUGIN_VIO


native_password_authenticate