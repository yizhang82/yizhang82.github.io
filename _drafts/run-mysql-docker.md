---
layout: post
title:  "Running mysql in docker containers"
description: "How to run mysql server in docker containers and connect"
permalink: docker-mysql
comments: true
excerpt_separator: <!--more-->
categories:
- docker
- mysql 
---

Some times you may find youself wanting to experiment with different versions of MySQL and see if the bug you are interested in that has been fixed, or validate some subtle behavioral differences, or just run a quick experiment, it's usually faster just to do it with `docker` rather than downloading the installer, or buliding the source code (though some of us may prefer it that way if you want to do some debugging). In this article I'll show you how to do just that.

A little bit background if you haven't got a chance to try out docker: docker is a container platform that allows you to pull images that container any software, from hello world to databases / compilers, etc and run them locally on your machine. It's a great way to have a reproduciable deployment environment with kernel-level isolations (depending on whether you are using VM or cgroups) to deploy any software and know exactly what configuration of kernel, libraries, config you'll have. It's also a good way to folks to pull down a image and just experiment with it, which is what we are most interested about in this case.

For example, let's say you want to run MySQL server 8.0.19 in a docker container. Note you need to specify one of the following variables: MYSQL_ROOT_PASSWORD, MYSQL_ALLOW_EMPTY_PASSWORD and MYSQL_RANDOM_ROOT_PASSWORD. For simple experiments like this, using MYSQL_ROOT_PASSWORD is the simplest.

```
docker run -e MYSQL_ROOT_PASSWORD=<your_root_password> mysql:8.0.19
```

NOTE: In linux you may need to run `sudo docker` instead of `docker`.

It'll quickly spin a new container with MySQL 8.0.19 Community Edition, initialize the database, and ready to receive connection, within just a few seconds (not counting the time to pull down the images, of course).

```
2020-03-28T21:21:14.158883Z 0 [System] [MY-010116] [Server] /usr/sbin/mysqld (mysqld 8.0.19) starting as process 1
2020-03-28T21:21:14.610543Z 0 [Warning] [MY-010068] [Server] CA certificate ca.pem is self signed.
2020-03-28T21:21:14.616148Z 0 [Warning] [MY-011810] [Server] Insecure configuration for --pid-file: Location '/var/run/mysqld' in the path is accessible to all OS users. Consider choosing a different directory.
2020-03-28T21:21:14.652725Z 0 [System] [MY-010931] [Server] /usr/sbin/mysqld: ready for connections. Version: '8.0.19'  socket: '/var/run/mysqld/mysqld.sock'  port: 3306  MySQL Community Server - GPL.
2020-03-28T21:21:14.712812Z 0 [System] [MY-011323] [Server] X Plugin ready for connections. Socket: '/var/run/mysqld/mysqlx.sock' bind-address: '::' port: 33060
```

> One gotcha is that Docker maybe typically sensitive to the order of arguments. So something like `docker run mysql:8.0.19 -e MYSQL_ROOT_PASSWORD=<your_root_password>` wouldn't have worked and it would still tell you the required variables are missing. Docker really need to step up its game to fix up the parser, period. 

Once the container is launched, you need to find the container using `docker ps`:

```
CONTAINER ID        IMAGE               COMMAND                  CREATED             STATUS              PORTS                 NAMES
95bdde6afb83        mysql:8.0.19        "docker-entrypoint.s…"   24 seconds ago      Up 23 seconds       3306/tcp, 33060/tcp   sad_hopper
```

Once you find the container ID, run `docker inspect <id> --format '{{ .NetworkSettings.IPAddress }}'` - it'll show you the IP address of the container. Note you can specify a prefix of the ID as long as there are no conflicts. So in this case `docker inspect 9` would've worked just as well as `docker inspect 95bdde6afb83`. 

Now that you have the IP address, you can use mysql client to connect to it by launching another container and run `mysql` command (instead of running MySQL server) with `docker run`:

```
docker run -it mysql:8.0.19 mysql -h<ip_address> -uroot -p
```

You'll be prompted to enter the password and once you do that you'll be able to connect to the instance:

```
Enter password:
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 8
Server version: 8.0.19 MySQL Community Server - GPL

Copyright (c) 2000, 2020, Oracle and/or its affiliates. All rights reserved.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> select @@version_comment;
+------------------------------+
| @@version_comment            |
+------------------------------+
| MySQL Community Server - GPL |
+------------------------------+
1 row in set (0.00 sec)
```

Just keep in mind everything you do in the container is temporary and will be destroyed once the container is gone.

If you want to do fancier thing like using your own my.cnf or mapping database to your localhost file, you can refer to https://hub.docker.com/_/mysql/ for more information.