---
layout: post
title:  "A great database course recommendation"
description: 15-721 Advanced Database Systems is a great database course for those who want to understand how database works
permalink: recommend-advanced-db-systems-course 
comments: true
excerpt_separator: <!--more-->
categories:
- storage
- database
- design
---

I just came across this youtube course [15-721 Advanced Database Systems](https://www.youtube.com/playlist?list=PLSE8ODhjZXjYgTIlqf4Dy9KQpQ7kn1Tl0) by Andy Pavlo from CMU. The courses are really well done - clearly articulated / explained and cover a broad range of topics, including a broad survey of different techniques covering implementation of transactions, indexing, concurrency, storage/compression, data structures, query optimization and execution, and finally, Non-Volatile Memory Databases which personally is my favorite database topic.  

However, do keep in mind that the talk focuses primarily in in-memory database systems, which in many ways share similar architecture with on-disk databases but comes with different trade-offs and therefore may end up with different choices in terms of algorithms, data structures and components, but the basic ideas are still the same.

In addition to the talk, you can follow the [Materials](https://15721.courses.cs.cmu.edu/spring2017/schedule.html#jan-17-2017) which include lots of interesting links to papers that worth digging into. Once you go through all these materials you'll for sure become a database expert, not in using databases (you still have to RFTW), but rather in implementing them.

The talk at times references new technique that are pioneered in CMU's database implementation [Peloton](https://github.com/cmu-db/peloton) which at this point seems to be actively abandoned in favor of a newly developed database system that is not yet announced. It'd be interesting to see what the folks at CMU came up with. Having a self-driving / self-tuning is the holy grail of databases but there are probably still quite bit ways to go there. Either way Peloton itself seems worth looking into purely for both academic and practical purposes. I'm considering writing some articles about it perhaps covering BW tree indexing and self-driving aspects. Stay tuned.

