---
layout: post
title:  "InnoDB resources"
description: 
permalink: innodb-resources 
comments: true
excerpt_separator: <!--more-->
categories:
- database 
- innodb 
- mysql 
---

If you work with MySQL, you should really understand how [InnoDB](https://dev.mysql.com/doc/refman/5.6/en/innodb-introduction.html) works - it's the default storage engine of MySQL, after all.

MySQL is kinda amazing in the way that it has a proper plugin model that that enable people [writing their own storage engines] (https://en.wikipedia.org/wiki/Comparison_of_MySQL_database_engines). InnoDB is the current default B+ tree storage engine in MySQL that oracle is actively developing, and itself is a plugin! 

> It's a good plugin model that get the job done, but unfortunately it's a rather leaky abstraction - most likely due to historical and/or performance reasons. I'll write another article about storage engines / plugins in general. However having this capability at all itself is a pretty amazing achievement. 

The best resource I can find regarding InnoDB is a set of blog articles authored by Jeremy: [InnoDB internals](https://blog.jcole.us/innodb/). He wrote a InnoDB clone called [innodb_ruby](https://github.com/jeremycole/innodb_ruby) as part of his journey to understand InnoDB. The articles are really in-depth and with amazing diagrams detailing [on-disk B+ tree structure](https://github.com/jeremycole/innodb_diagrams/blob/master/images/InnoDB_Structures.pdf) as well as [log structure](https://github.com/jeremycole/innodb_diagrams/blob/master/images/InnoDB_Log_Structures.pdf). 

In additional to the above, there are a few interesting presentations:

* [InnoDB internals](http://topic.it168.com/factory/DTCC2013/doc/a30.pdf). It jumps into internals pretty quickly and extensively talk about 

* [The InnoDB storage engine for MySQL](https://www.slideshare.net/morgo/inno-db-presentation). A bit more high-level. Interestingly it uses Jeremy's diagram in the PPT.

Of course, the ultimate reference is the source code. You can find a mirror at [github](https://github.com/mysql/mysql-server/tree/8.0/storage/innobase). Note how it is under storage folder which means it gets the same treatment as the other storage plugins. The main plugin part is a huge 22483 lines [ha_innodb.cc](https://github.com/mysql/mysql-server/blob/8.0/storage/innobase/handler/ha_innodb.cc) that overrides the handler structures and provides the integration points. However, before you jump in, I recommend you get yourself familiar with general MySQL storage plugin structure first so that you wouldn't get lost, or, wait for my storage plugin article. 